
-- Create companies table
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_code TEXT UNIQUE NOT NULL,
  staff_pin TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  system_active BOOLEAN NOT NULL DEFAULT true,
  gmail_connected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount NUMERIC(15, 2) NOT NULL,
  sender_name TEXT NOT NULL,
  bank_source TEXT NOT NULL DEFAULT 'Unknown',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Companies: Boss can CRUD their own company
CREATE POLICY "Boss: select own company" ON public.companies
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Boss: insert company" ON public.companies
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Boss: update own company" ON public.companies
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Boss: delete own company" ON public.companies
  FOR DELETE USING (auth.uid() = owner_id);

-- Transactions: Boss can CRUD all transactions for their company
CREATE POLICY "Boss: select own transactions" ON public.transactions
  FOR SELECT USING (
    company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
  );

CREATE POLICY "Boss: insert transactions" ON public.transactions
  FOR INSERT WITH CHECK (
    company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
  );

CREATE POLICY "Boss: update transactions" ON public.transactions
  FOR UPDATE USING (
    company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
  );

CREATE POLICY "Boss: delete transactions" ON public.transactions
  FOR DELETE USING (
    company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
  );

-- Transactions: Public read for recent transactions (used by Staff kiosk sessions validated client-side)
-- Staff access is validated via company_code+pin lookup, then company_id is stored locally
-- We need a function to validate staff login
CREATE OR REPLACE FUNCTION public.validate_staff_login(p_company_code TEXT, p_staff_pin TEXT)
RETURNS TABLE(company_id UUID, company_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name
  FROM public.companies c
  WHERE c.company_code = p_company_code
    AND c.staff_pin = p_staff_pin
    AND c.system_active = true;
END;
$$;

-- Function to get recent transactions for a company (for staff - last 24 hours)
CREATE OR REPLACE FUNCTION public.get_staff_transactions(p_company_id UUID, p_company_code TEXT, p_staff_pin TEXT)
RETURNS TABLE(
  id UUID,
  company_id UUID,
  amount NUMERIC,
  sender_name TEXT,
  bank_source TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate the staff credentials first
  IF NOT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = p_company_id
      AND c.company_code = p_company_code
      AND c.staff_pin = p_staff_pin
      AND c.system_active = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT t.id, t.company_id, t.amount, t.sender_name, t.bank_source, t.status, t.created_at
  FROM public.transactions t
  WHERE t.company_id = p_company_id
    AND t.created_at >= now() - INTERVAL '24 hours'
  ORDER BY t.created_at DESC;
END;
$$;

-- Enable realtime on transactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

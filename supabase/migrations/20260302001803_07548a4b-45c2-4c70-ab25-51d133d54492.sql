
-- RLS policies for staff table (admins manage their own company's staff)
CREATE POLICY "Owner can view staff"
ON public.staff FOR SELECT
USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can insert staff"
ON public.staff FOR INSERT
WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can update staff"
ON public.staff FOR UPDATE
USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can delete staff"
ON public.staff FOR DELETE
USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

-- Enable RLS on staff table
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- New function for individual staff PIN login (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.validate_individual_staff_login(p_company_code text, p_staff_pin text)
RETURNS TABLE(company_id uuid, company_name text, staff_id uuid, staff_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id AS company_id, c.name AS company_name, s.id AS staff_id, s.name AS staff_name
  FROM public.companies c
  JOIN public.staff s ON s.company_id = c.id
  WHERE c.company_code = p_company_code
    AND s.pin = p_staff_pin
    AND s.is_active = true
    AND c.system_active = true;
END;
$$;

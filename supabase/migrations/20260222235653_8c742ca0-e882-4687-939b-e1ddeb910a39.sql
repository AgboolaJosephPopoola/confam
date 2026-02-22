-- Allow anyone to read banks (public reference data)
CREATE POLICY "Anyone can read banks"
ON public.banks
FOR SELECT
USING (true);

-- Allow authenticated users to insert custom banks
CREATE POLICY "Authenticated users can insert banks"
ON public.banks
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Allow authenticated users to delete non-default banks
CREATE POLICY "Authenticated users can delete custom banks"
ON public.banks
FOR DELETE
USING (auth.uid() IS NOT NULL AND is_default = false);
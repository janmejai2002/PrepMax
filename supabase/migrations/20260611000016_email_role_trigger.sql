-- Migration 016: auto-set year from email prefix on profile INSERT
--
-- b25NNN@astra.xlri.ac.in  →  year = 'second'  (senior)
-- b26NNN@astra.xlri.ac.in  →  year = 'first'   (junior)
-- any other email          →  year unchanged (form/seed value stands)

CREATE OR REPLACE FUNCTION public.set_year_from_email()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email ~* '^b25[0-9]+@astra\.xlri\.ac\.in$' THEN
    NEW.year := 'second';
  ELSIF NEW.email ~* '^b26[0-9]+@astra\.xlri\.ac\.in$' THEN
    NEW.year := 'first';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_year_from_email
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_year_from_email();

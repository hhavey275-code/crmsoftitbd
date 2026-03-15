
-- Create storage bucket for payment proof screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-proofs', 'payment-proofs', true);

-- Allow authenticated users to upload their own payment proofs
CREATE POLICY "Users can upload payment proofs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow anyone to view payment proofs (public bucket)
CREATE POLICY "Public can view payment proofs" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'payment-proofs');

-- Allow admins to manage payment proofs
CREATE POLICY "Admins can manage payment proofs" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'payment-proofs' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Superadmins can manage payment proofs" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'payment-proofs' AND has_role(auth.uid(), 'superadmin'));


CREATE POLICY "Superadmins can upload logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'logos' AND has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can update logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'logos' AND has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can delete logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'logos' AND has_role(auth.uid(), 'superadmin'));

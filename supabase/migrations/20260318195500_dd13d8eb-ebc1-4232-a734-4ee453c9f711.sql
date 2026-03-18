-- Ensure admin request notifications are generated automatically on new requests
CREATE OR REPLACE FUNCTION public.notify_admins_on_topup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, reference_id)
  SELECT ur.user_id,
         'top_up_request',
         'New Top-Up Request',
         'A client submitted a top-up request for $' || NEW.amount,
         NEW.id
  FROM public.user_roles ur
  WHERE ur.role IN ('admin', 'superadmin');

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_admins_on_topup ON public.top_up_requests;
CREATE TRIGGER trg_notify_admins_on_topup
AFTER INSERT ON public.top_up_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_topup();

DROP TRIGGER IF EXISTS trg_notify_admins_on_ad_account_request ON public.ad_account_requests;
CREATE TRIGGER trg_notify_admins_on_ad_account_request
AFTER INSERT ON public.ad_account_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_ad_account_request();

DROP TRIGGER IF EXISTS trg_notify_admins_on_bm_access_request ON public.bm_access_requests;
CREATE TRIGGER trg_notify_admins_on_bm_access_request
AFTER INSERT ON public.bm_access_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_bm_access_request();
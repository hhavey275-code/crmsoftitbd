-- Normalize admin-notification triggers to one trigger per request table
DROP TRIGGER IF EXISTS on_topup_request_created ON public.top_up_requests;
DROP TRIGGER IF EXISTS on_topup_request_notify_admins ON public.top_up_requests;
DROP TRIGGER IF EXISTS trg_notify_admins_on_topup ON public.top_up_requests;
CREATE TRIGGER on_topup_request_notify_admins
AFTER INSERT ON public.top_up_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_topup();

DROP TRIGGER IF EXISTS on_ad_account_request_created ON public.ad_account_requests;
DROP TRIGGER IF EXISTS on_ad_account_request_notify_admins ON public.ad_account_requests;
DROP TRIGGER IF EXISTS trg_notify_admins_on_ad_account_request ON public.ad_account_requests;
CREATE TRIGGER on_ad_account_request_notify_admins
AFTER INSERT ON public.ad_account_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_ad_account_request();

DROP TRIGGER IF EXISTS on_bm_access_request_created ON public.bm_access_requests;
DROP TRIGGER IF EXISTS on_bm_access_request_notify_admins ON public.bm_access_requests;
DROP TRIGGER IF EXISTS trg_notify_admins_on_bm_access_request ON public.bm_access_requests;
CREATE TRIGGER on_bm_access_request_notify_admins
AFTER INSERT ON public.bm_access_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_bm_access_request();
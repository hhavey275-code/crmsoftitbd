-- Attach trigger: notify admins when top-up request is created
CREATE TRIGGER on_topup_request_notify_admins
  AFTER INSERT ON public.top_up_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_on_topup();

-- Attach trigger: notify admins when ad account request is created
CREATE TRIGGER on_ad_account_request_notify_admins
  AFTER INSERT ON public.ad_account_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_on_ad_account_request();

-- Attach trigger: notify admins when BM access request is created
CREATE TRIGGER on_bm_access_request_notify_admins
  AFTER INSERT ON public.bm_access_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_on_bm_access_request();

-- Attach trigger: send push notification when notification is inserted
CREATE TRIGGER on_notification_send_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_notification();
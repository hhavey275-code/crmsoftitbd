
CREATE OR REPLACE FUNCTION public.trigger_push_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://xdltjsdhtcohyhwzcpsx.supabase.co/functions/v1/send-push-notification',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('supabase.service_role_key', true) || '"}'::jsonb,
      body := jsonb_build_object(
        'user_id', NEW.user_id,
        'title', NEW.title,
        'message', COALESCE(NEW.message, ''),
        'type', NEW.type
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Push notification trigger failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

# Avisos con la app cerrada (Web Push)

Sin esto, los recordatorios los dispara un `setInterval` dentro de la app
(`src/services/reminderScheduler.ts`): si Quest no está abierta, ese temporizador
no corre y no llega nada. Con Web Push, quien avisa es el servidor y el móvil
recibe la notificación aunque esté bloqueado.

Piezas:

- `public/push-sw.js` — el service worker escucha `push` y muestra la notificación.
- `src/services/webPush.ts` — suscribe el dispositivo y guarda la suscripción.
- `supabase/functions/push-reminders/` — Edge Function que decide qué avisar.
- `supabase/schema.sql` — tablas `push_subscriptions` y `push_sent`.

## 1. Tablas

En Supabase Dashboard → SQL Editor, ejecuta `supabase/schema.sql` entero. Es
re-ejecutable: aunque ya lo hubieras corrido antes para la sincronización,
volver a pasarlo no rompe nada.

## 2. Claves VAPID

Son el par de claves que identifica a tu servidor ante el navegador. Se generan
una sola vez:

```bash
npx web-push generate-vapid-keys
```

Guarda las dos. La **pública** va a la app, la **privada** solo al servidor.

## 3. Variables de entorno

En `.env.local` del proyecto (y en las variables de tu hosting):

```
VITE_VAPID_PUBLIC_KEY=<clave pública>
```

En Supabase Dashboard → Edge Functions → Secrets:

```
VAPID_PUBLIC_KEY=<clave pública>
VAPID_PRIVATE_KEY=<clave privada>
VAPID_SUBJECT=mailto:tu@email.com
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase sola.

## 4. Desplegar la función

```bash
npx supabase functions deploy push-reminders --no-verify-jwt
```

`--no-verify-jwt` porque la función valida ella misma la cabecera
`Authorization` contra la service role key (ver el inicio de `index.ts`).

## 5. Programarla cada minuto

En SQL Editor, sustituyendo la URL del proyecto y la service role key:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'quest-push-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://TU-PROYECTO.supabase.co/functions/v1/push-reminders',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer TU_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

Para quitarlo: `select cron.unschedule('quest-push-reminders');`

## 6. Activarlo en el móvil

1. Construye y despliega (`npm run build`) — **el service worker solo existe en
   producción**, en `npm run dev` está desactivado a propósito.
2. En iPhone: abre Quest en Safari → Compartir → *Añadir a pantalla de inicio*,
   y ábrela desde el icono. iOS solo permite push en apps instaladas (iOS 16.4+).
3. Inicia sesión (la suscripción se guarda atada a tu usuario).
4. Ajustes → Notificaciones → *Activar* y luego *Avisos con la app cerrada →
   Activar*.

## Cómo se evitan los avisos duplicados

- Mientras la app está abierta manda un latido cada minuto (`last_seen_at`). La
  Edge Function ignora los dispositivos vistos hace menos de 2 minutos, porque
  ahí el aviso ya lo está dando el temporizador in-app.
- Cada aviso enviado se registra en `push_sent` con una clave única
  (`r:<id>:<remindAt>` para recordatorios, `h:<id>:<día>` para hábitos), así que
  el cron de cada minuto no repite lo mismo.
- Un recordatorio que lleva más de 12 horas vencido ya no se notifica.

## Limitaciones

- El pomodoro no manda push: sus fases solo tienen sentido con la app abierta.
- Android puede retrasar los avisos si Quest está bajo optimización de batería;
  conviene excluirla en Ajustes → Batería.

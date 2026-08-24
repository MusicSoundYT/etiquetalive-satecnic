-- Visto en producción: TikTok a veces rellena, en el primer aviso, un
-- nombre PROVISIONAL para recipient_address.name (no vacío, pero tampoco el
-- nombre real de envío — p. ej. "usuario NombreRaro" en vez del nombre real)
-- que luego sustituye por el definitivo en un aviso posterior. El código
-- solo volvía a comprobar el nombre cuando era el placeholder vacío ("—"),
-- así que este otro caso nunca se corregía — el mismo cliente real acababa
-- con dos pedidos con "cliente" distinto, partiéndose en dos fichas en Caja
-- TikTok. Esta columna marca si ya se ha hecho esa segunda comprobación,
-- para hacerla como mucho una vez por pedido (no en cada aviso posterior).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cliente_verificado boolean NOT NULL DEFAULT false;

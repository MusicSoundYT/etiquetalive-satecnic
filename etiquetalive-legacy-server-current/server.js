const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Database = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3001;
const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
const STRIPE_SECRET = process.env.STRIPE_SECRET || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://etiquetalive.satecnic.es';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// ─── Stripe ─────────────────────────────────────────────────────────────────
let stripe = null;
if (STRIPE_SECRET) {
  try { stripe = require('stripe')(STRIPE_SECRET); } catch(e) { console.log('⚠️ Stripe no configurado'); }
}

// ─── Supabase ───────────────────────────────────────────────────────────────
async function verifySupabaseConnection() {
  if (!supabase || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { configured: false, ok: false, status: 'missing_env' };
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    return { configured: true, ok: response.ok, status: response.status };
  } catch (error) {
    return { configured: true, ok: false, status: 'error', error: error.message };
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','OPTIONS'], allowedHeaders: ['Content-Type','x-api-key','Authorization','x-el-sign'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Database ───────────────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || '/opt/etiquetalive/data/etiquetalive.db';
const db = new Database.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nombre TEXT,
    api_key TEXT UNIQUE,
    suscripcion_activa INTEGER DEFAULT 0,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    fecha_registro TEXT DEFAULT (datetime('now')),
    fecha_expiracion TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id_pedido TEXT PRIMARY KEY,
    id_usuario TEXT NOT NULL,
    tk TEXT NOT NULL,
    order_id TEXT,
    cliente TEXT,
    precio REAL,
    moneda TEXT DEFAULT 'EUR',
    fecha_pedido TEXT,
    fecha_detectado TEXT DEFAULT (datetime('now')),
    estado_impresion TEXT DEFAULT 'detectado',
    fecha_impresion TEXT,
    reimpresiones INTEGER DEFAULT 0,
    impresiones_cobrables INTEGER DEFAULT 0,
    ultimo_cobro_impresion TEXT,
    raw_detectado TEXT,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
  )`);


  db.run(`CREATE TABLE IF NOT EXISTS auction_events (
    id_event TEXT PRIMARY KEY,
    id_usuario TEXT,
    winner TEXT,
    product_name TEXT,
    price TEXT,
    auction_id TEXT,
    source TEXT,
    page_url TEXT,
    raw TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    matched_order_id TEXT,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS configuracion_plantilla (
    id_config TEXT PRIMARY KEY,
    id_usuario TEXT UNIQUE NOT NULL,
    label_width_mm INTEGER DEFAULT 60,
    label_height_mm INTEGER DEFAULT 29,
    orientation TEXT DEFAULT 'landscape',
    qr_size_mm REAL DEFAULT 13,
    title_font_pt REAL DEFAULT 5,
    tk_font_pt REAL DEFAULT 7,
    customer_font_pt REAL DEFAULT 8.4,
    price_font_pt REAL DEFAULT 10.5,
    date_font_pt REAL DEFAULT 5.4,
    show_tk INTEGER DEFAULT 1,
    show_title INTEGER DEFAULT 1,
    show_date INTEGER DEFAULT 1,
    show_cliente INTEGER DEFAULT 1,
    show_tiktok_name INTEGER DEFAULT 1,
    show_order_id INTEGER DEFAULT 1,
    show_price INTEGER DEFAULT 1,
    show_auction INTEGER DEFAULT 1,
    show_datetime INTEGER DEFAULT 1,
    show_qr INTEGER DEFAULT 1,
    order_auction INTEGER DEFAULT 1,
    order_cliente INTEGER DEFAULT 2,
    order_tiktok_name INTEGER DEFAULT 3,
    order_order_id INTEGER DEFAULT 4,
    order_price INTEGER DEFAULT 5,
    order_datetime INTEGER DEFAULT 6,
    tiktok_font_pt REAL DEFAULT 8.4,
    order_font_pt REAL DEFAULT 7,
    label_font_pt REAL DEFAULT 10,
    default_template INTEGER DEFAULT 1,
    line_spacing_mm REAL DEFAULT 3,
    title_data_gap_mm REAL DEFAULT 1,
    letter_spacing_pt REAL DEFAULT 0,
    label_col_width_mm REAL DEFAULT 24,
    column_gap_mm REAL DEFAULT 2,
    padding_mm REAL DEFAULT 1,
    auto_print_enabled INTEGER DEFAULT 1,
    seller_refresh_seconds INTEGER DEFAULT 15,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS plantillas_etiqueta (
    id_template TEXT PRIMARY KEY,
    id_usuario TEXT NOT NULL,
    nombre TEXT NOT NULL,
    config_json TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
  )`);

  [
    ['show_cliente', 'INTEGER DEFAULT 1'],
    ['show_tiktok_name', 'INTEGER DEFAULT 1'],
    ['show_order_id', 'INTEGER DEFAULT 1'],
    ['show_price', 'INTEGER DEFAULT 1'],
    ['show_auction', 'INTEGER DEFAULT 1'],
    ['show_datetime', 'INTEGER DEFAULT 1'],
    ['show_qr', 'INTEGER DEFAULT 1'],
    ['order_auction', 'INTEGER DEFAULT 1'],
    ['order_cliente', 'INTEGER DEFAULT 2'],
    ['order_tiktok_name', 'INTEGER DEFAULT 3'],
    ['order_order_id', 'INTEGER DEFAULT 4'],
    ['order_price', 'INTEGER DEFAULT 5'],
    ['order_datetime', 'INTEGER DEFAULT 6'],
    ['tiktok_font_pt', 'REAL DEFAULT 8.4'],
    ['order_font_pt', 'REAL DEFAULT 7'],
    ['label_font_pt', 'REAL DEFAULT 10'],
    ['default_template', 'INTEGER DEFAULT 1'],
    ['line_spacing_mm', 'REAL DEFAULT 3'],
    ['title_data_gap_mm', 'REAL DEFAULT 1'],
    ['letter_spacing_pt', 'REAL DEFAULT 0'],
    ['label_col_width_mm', 'REAL DEFAULT 24'],
    ['column_gap_mm', 'REAL DEFAULT 2'],
    ['auto_print_enabled', 'INTEGER DEFAULT 1'],
    ['seller_refresh_seconds', 'INTEGER DEFAULT 15']
  ].forEach(([name, type]) => {
    db.run(`ALTER TABLE configuracion_plantilla ADD COLUMN ${name} ${type}`, () => {});
  });

  db.run(`CREATE TABLE IF NOT EXISTS tk_counter (
    id_usuario TEXT PRIMARY KEY,
    counter INTEGER DEFAULT 0,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    id_usuario TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
  )`);

  // Migraciones ligeras para billing por impresión/reimpresión.
  db.run(`ALTER TABLE pedidos ADD COLUMN impresiones_cobrables INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN ultimo_cobro_impresion TEXT`, () => {});
});

// ─── Helpers ────────────────────────────────────────────────────────────────
function generateApiKey() { return 'el_' + uuidv4().replace(/-/g, ''); }

async function syncUserToSupabase(user) {
  if (!supabase || !user?.id_usuario || !user?.email) return;
  try {
    const tenant = {
      id: user.id_usuario,
      business_name: user.nombre || user.email,
      tax_id: 'PENDING',
      billing_email: user.email,
      fiscal_address: 'PENDING',
      city: 'PENDING',
      province: 'PENDING',
      postal_code: '00000',
      country: 'ES',
      status: user.suscripcion_activa ? 'active' : 'pending',
    };
    const { error: tenantError } = await supabase.from('tenants').upsert(tenant, { onConflict: 'id' });
    if (tenantError) throw tenantError;

    const { error: userError } = await supabase.from('users').upsert({
      id: user.id_usuario,
      tenant_id: user.id_usuario,
      email: user.email,
      name: user.nombre || '',
      role: 'owner',
      password_hash: user.password_hash || null,
    }, { onConflict: 'id' });
    if (userError) throw userError;

    if (user.api_key) {
      const { error: keyError } = await supabase.from('api_keys').upsert({
        tenant_id: user.id_usuario,
        key_hash: user.api_key,
        key_prefix: user.api_key.slice(0, 8),
        status: user.suscripcion_activa ? 'active' : 'pending',
      }, { onConflict: 'key_hash' });
      if (keyError) throw keyError;
    }
  } catch (error) {
    console.log('⚠️ Supabase user sync failed:', error.message);
  }
}

function getBillingPeriodDates(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { period_start: start.toISOString().slice(0, 10), period_end: end.toISOString().slice(0, 10) };
}

async function incrementBillingPeriod(tenantId, priceCents = 10) {
  if (!supabase || !tenantId) return;
  const { period_start, period_end } = getBillingPeriodDates();
  const { data: existing, error: selectError } = await supabase
    .from('billing_periods')
    .select('id, orders_count, amount_cents, status')
    .eq('tenant_id', tenantId)
    .eq('period_start', period_start)
    .eq('period_end', period_end)
    .maybeSingle();
  if (selectError) throw selectError;

  const row = {
    tenant_id: tenantId,
    period_start,
    period_end,
    orders_count: (existing?.orders_count || 0) + 1,
    amount_cents: (existing?.amount_cents || 0) + priceCents,
    status: existing?.status || 'open',
  };
  const { error: upsertError } = await supabase
    .from('billing_periods')
    .upsert(row, { onConflict: 'tenant_id,period_start,period_end' });
  if (upsertError) throw upsertError;
}

async function syncBillablePrintToSupabase(usuario, order, printType = 'print') {
  if (!supabase || !usuario?.id_usuario || !order?.order_id) return { ok: false, skipped: true };
  try {
    const priceCents = Number(order.price_cents || 10);
    const printIndex = Number(order.print_index || 1);
    const externalId = `${String(order.order_id)}#${printType}-${printIndex}`;
    const { data, error } = await supabase.from('orders_processed').upsert({
      tenant_id: usuario.id_usuario,
      external_order_id: externalId,
      tk_number: order.tk || null,
      source: printType === 'reprint' ? 'chrome_extension_reprint' : 'chrome_extension_print',
      price_cents: priceCents,
      raw_payload: order.raw_payload || null,
    }, { onConflict: 'tenant_id,external_order_id', ignoreDuplicates: true }).select('id');
    if (error) throw error;
    if (data && data.length > 0) await incrementBillingPeriod(usuario.id_usuario, priceCents);
    return { ok: true, inserted: !!(data && data.length > 0), external_id: externalId };
  } catch (error) {
    console.log('⚠️ Supabase billable print sync failed:', error.message);
    return { ok: false, error: error.message };
  }
}



async function maybeStorePasswordResetSupabase(userId, token, expiresAt) {
  if (!supabase) return;
  try {
    await supabase.from('password_reset_tokens').insert({
      user_id: userId,
      token_hash: token,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.log('⚠️ Supabase password reset sync skipped:', error.message);
  }
}

async function getSupabaseUserByApiKey(apiKey) {
  if (!supabase || !apiKey) return null;
  const { data: keyRow, error: keyError } = await supabase
    .from('api_keys')
    .select('tenant_id, status')
    .eq('key_hash', apiKey)
    .eq('status', 'active')
    .maybeSingle();
  if (keyError || !keyRow) return null;
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, tenant_id, email, name')
    .eq('tenant_id', keyRow.tenant_id)
    .eq('role', 'owner')
    .maybeSingle();
  if (userError || !userRow) return null;
  return {
    id_usuario: userRow.tenant_id,
    email: userRow.email,
    nombre: userRow.name || '',
    api_key: apiKey,
    suscripcion_activa: 1,
  };
}


function generateTK(id_usuario, cb) {
  db.run(`INSERT INTO tk_counter (id_usuario, counter) VALUES (?, 1)
    ON CONFLICT(id_usuario) DO UPDATE SET counter = counter + 1`, [id_usuario], function() {
    db.get(`SELECT counter FROM tk_counter WHERE id_usuario = ?`, [id_usuario], (err, row) => {
      cb(null, `TK-${String(row.counter).padStart(5, '0')}`);
    });
  });
}

function validateClientSignature(req, res, next) {
  // Client secret validation to prevent unauthorized copies
  const sig = req.headers['x-el-sign'];
  if (!sig || sig.length < 8) {
    return res.status(401).json({ error: 'Origen no autorizado' });
  }
  // Simple validation: signature must start with 'el_'
  if (!sig.startsWith('el_')) {
    return res.status(401).json({ error: 'Firma inválida' });
  }
  next();
}

function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key requerida' });
  db.get(`SELECT * FROM usuarios WHERE api_key = ? AND suscripcion_activa = 1`, [apiKey], async (err, user) => {
    if (user) {
      req.usuario = user;
      return next();
    }
    const supabaseUser = await getSupabaseUserByApiKey(apiKey);
    if (!supabaseUser) return res.status(401).json({ error: 'API key inválida o suscripción inactiva' });
    req.usuario = supabaseUser;
    next();
  });
}

function authJWT(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'Token requerido' });
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    db.get(`SELECT * FROM usuarios WHERE id_usuario = ?`, [decoded.sub], (err, user) => {
      if (err || !user) return res.status(401).json({ error: 'Usuario no encontrado' });
      req.usuario = user;
      next();
    });
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// ─── Auth Routes ────────────────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { email, password, nombre } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y password requeridos' });
  const id = uuidv4();
  const apiKey = generateApiKey();
  const hash = bcrypt.hashSync(password, 10);
  db.run(`INSERT INTO usuarios (id_usuario, email, password_hash, nombre, api_key, suscripcion_activa)
    VALUES (?, ?, ?, ?, ?, 1)`, [id, email, hash, nombre || '', apiKey], function(err) {
    if (err) return res.status(400).json({ error: 'Email ya registrado' });
    db.run(`INSERT INTO configuracion_plantilla (id_config, id_usuario) VALUES (?, ?)`, [uuidv4(), id]);
    syncUserToSupabase({ id_usuario: id, email, password_hash: hash, nombre: nombre || '', api_key: apiKey, suscripcion_activa: 1 });
    const token = jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ id_usuario: id, api_key: apiKey, token, email, nombre, creditos: 0 });
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], (err, user) => {
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Credenciales inválidas' });
    syncUserToSupabase(user);
    const token = jwt.sign({ sub: user.id_usuario }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, api_key: user.api_key, id_usuario: user.id_usuario, email: user.email, nombre: user.nombre });
  });
});


app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  // Always return ok to avoid account enumeration.
  if (!email) return res.json({ status: 'ok', message: 'Si el email existe, enviaremos instrucciones.' });
  db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], (err, user) => {
    if (!user) return res.json({ status: 'ok', message: 'Si el email existe, enviaremos instrucciones.' });
    const resetToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.run(`INSERT INTO password_reset_tokens (id, id_usuario, token, expires_at) VALUES (?, ?, ?, ?)`,
      [uuidv4(), user.id_usuario, resetToken, expires], () => {
        maybeStorePasswordResetSupabase(user.id_usuario, resetToken, expires);
        const resetUrl = `${FRONTEND_URL}/?reset_token=${resetToken}`;
        console.log(`🔐 Password reset for ${email}: ${resetUrl}`);
        res.json({
          status: 'ok',
          message: 'Si el email existe, enviaremos instrucciones.',
          reset_url_dev: process.env.PASSWORD_RESET_DEV_MODE === '1' ? resetUrl : undefined,
        });
      });
  });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 8) return res.status(400).json({ error: 'Token y contraseña de mínimo 8 caracteres requeridos' });
  db.get(`SELECT * FROM password_reset_tokens WHERE token = ? AND used_at IS NULL`, [token], (err, row) => {
    if (err || !row) return res.status(400).json({ error: 'Token inválido o caducado' });
    if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'Token caducado' });
    const hash = bcrypt.hashSync(password, 10);
    db.run(`UPDATE usuarios SET password_hash = ? WHERE id_usuario = ?`, [hash, row.id_usuario], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: 'No se pudo actualizar la contraseña' });
      db.run(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?`, [row.id]);
      if (supabase) {
        supabase.from('users').update({ password_hash: hash }).eq('id', row.id_usuario).then(({ error }) => {
          if (error) console.log('⚠️ Supabase password update failed:', error.message);
        });
      }
      res.json({ status: 'ok' });
    });
  });
});

// ─── Stripe Checkout ────────────────────────────────────────────────────────
app.post('/api/stripe/create-checkout', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe no configurado' });
  const { priceId, successUrl, cancelUrl } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId || STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      success_url: successUrl || `${FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${FRONTEND_URL}`,
    });
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stripe Customer Portal ──────────────────────────────────────────────────
app.post("/api/stripe/create-portal-session", async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe no configurado" });
  const { customerId, returnUrl } = req.body;
  if (!customerId) return res.status(400).json({ error: "customerId requerido" });
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || "https://n8n.satecnic.es/etiquetalive/dashboard",
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stripe Webhook ─────────────────────────────────────────────────────────
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  if (STRIPE_WEBHOOK_SECRET) {
    const sig = req.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.log('⚠️ Stripe webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    try {
      event = JSON.parse(req.body.toString());
    } catch (err) {
      return res.status(400).send('Invalid payload');
    }
  }

  console.log(`📨 Stripe webhook: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const customerId = session.customer;
      const subscriptionId = session.subscription;
      const customerEmail = session.customer_details?.email;

      if (customerEmail) {
        // Find user by email and link Stripe IDs
        db.get(`SELECT * FROM usuarios WHERE email = ?`, [customerEmail], (err, user) => {
          if (user) {
            const expiry = new Date();
            expiry.setMonth(expiry.getMonth() + 1);
            db.run(`UPDATE usuarios SET
              stripe_customer_id = ?, stripe_subscription_id = ?,
              suscripcion_activa = 1, fecha_expiracion = ?
              WHERE id_usuario = ?`,
              [customerId, subscriptionId, expiry.toISOString(), user.id_usuario]);
            console.log(`✅ Suscripción activada para ${customerEmail}`);
          } else {
            // Create user if doesn't exist (shouldn't happen normally)
            const id = uuidv4();
            const apiKey = generateApiKey();
            const hash = bcrypt.hashSync('temporal', 10);
            const expiry = new Date();
            expiry.setMonth(expiry.getMonth() + 1);
            db.run(`INSERT INTO usuarios (id_usuario, email, password_hash, nombre, api_key,
              suscripcion_activa, stripe_customer_id, stripe_subscription_id, fecha_expiracion)
              VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
              [id, customerEmail, hash, '', apiKey, customerId, subscriptionId, expiry.toISOString()]);
            db.run(`INSERT INTO configuracion_plantilla (id_config, id_usuario) VALUES (?, ?)`, [uuidv4(), id]);
            console.log(`✅ Usuario creado desde Stripe: ${customerEmail}`);
          }
        });
      }
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;
      if (subscriptionId) {
        const expiry = new Date();
        expiry.setMonth(expiry.getMonth() + 1);
        db.run(`UPDATE usuarios SET suscripcion_activa = 1, fecha_expiracion = ?
          WHERE stripe_subscription_id = ?`, [expiry.toISOString(), subscriptionId]);
        console.log(`✅ Factura pagada, suscripción renovada: ${subscriptionId}`);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const failedInvoice = event.data.object;
      const failedSubId = failedInvoice.subscription;
      if (failedSubId) {
        db.run(`UPDATE usuarios SET suscripcion_activa = 0
          WHERE stripe_subscription_id = ?`, [failedSubId]);
        console.log(`⚠️ Pago fallido, suscripción suspendida: ${failedSubId}`);
      }
      break;
    }

    case 'customer.subscription.deleted':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const status = subscription.status;
      const subId = subscription.id;
      const active = (status === 'active' || status === 'trialing') ? 1 : 0;
      const expiry = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;
      db.run(`UPDATE usuarios SET suscripcion_activa = ?, fecha_expiracion = ?
        WHERE stripe_subscription_id = ?`, [active, expiry, subId]);
      console.log(`📋 Suscripción ${subId}: ${status} → activa=${active}`);
      break;
    }
  }

  res.json({ received: true });
});


app.post('/api/auction/event', validateClientSignature, async (req, res) => {
  const event = req.body?.event || req.body || {};
  const apiKey = req.headers['x-api-key'];
  let usuario = null;
  if (apiKey) {
    usuario = await new Promise(resolve => {
      db.get(`SELECT * FROM usuarios WHERE api_key = ?`, [apiKey], async (err, user) => {
        if (user) return resolve(user);
        try { return resolve(await getSupabaseUserByApiKey(apiKey)); }
        catch (_) { return resolve(null); }
      });
    });
  }
  const id = uuidv4();
  const winner = String(event.winner || '').trim().slice(0, 160);
  const productName = String(event.productName || event.product_name || '').trim().slice(0, 240);
  const price = String(event.price || '').trim().slice(0, 80);
  const auctionId = String(event.auctionId || event.auction_id || '').trim().slice(0, 120);
  const source = String(event.source || 'auction').trim().slice(0, 80);
  const pageUrl = String(event.pageUrl || '').trim().slice(0, 1000);
  const raw = JSON.stringify(event).slice(0, 8000);
  db.run(`INSERT INTO auction_events (id_event, id_usuario, winner, product_name, price, auction_id, source, page_url, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, usuario?.id_usuario || null, winner, productName, price, auctionId, source, pageUrl, raw],
    (err) => {
      if (err) return res.status(500).json({ error: 'No se pudo guardar evento de subasta' });
      res.json({ status: 'ok', id_event: id, linked_user: Boolean(usuario?.id_usuario) });
    }
  );
});

app.post('/api/auction/request', validateClientSignature, (req, res) => {
  // Endpoint ligero de observación: confirma recepción sin persistir payloads grandes.
  res.json({ status: 'ok', captured: true });
});

app.get('/api/auction/events', authJWT, (req, res) => {
  db.all(`SELECT * FROM auction_events WHERE id_usuario IS NULL OR id_usuario = ? ORDER BY datetime(created_at) DESC LIMIT 100`,
    [req.usuario.id_usuario], (err, rows) => {
      if (err) return res.status(500).json({ error: 'No se pudieron cargar eventos' });
      res.json({ items: rows || [] });
    });
});


function priceNumber(value) {
  const m = String(value || '').match(/(\d{1,6}(?:[,.]\d{1,2})?)/);
  return m ? Number(m[1].replace(',', '.')) : 0;
}
function samePrice(a, b) {
  const na = priceNumber(a), nb = priceNumber(b);
  return na > 0 && nb > 0 && Math.abs(na - nb) < 0.01;
}
function enrichRawWithAuctionWinner(idUsuario, precio, raw, cb) {
  db.all(`SELECT winner, price, raw, created_at FROM auction_events
          WHERE (id_usuario IS NULL OR id_usuario = ?)
            AND datetime(created_at) >= datetime('now','-2 hours')
          ORDER BY datetime(created_at) DESC LIMIT 40`, [idUsuario], (err, rows) => {
    if (err || !rows?.length) return cb(raw || '');
    const match = rows.find(r => samePrice(r.price, precio) && String(r.winner || '').trim());
    if (!match?.winner) return cb(raw || '');
    let base = raw || '';
    try {
      const parsed = base && String(base).trim().startsWith('{') ? JSON.parse(base) : { raw: base };
      parsed.tiktok_name = parsed.tiktok_name || match.winner;
      parsed.auction_winner = match.winner;
      parsed.auction_price = match.price;
      parsed.auction_linked_at = new Date().toISOString();
      return cb(JSON.stringify(parsed));
    } catch (_) {
      return cb(JSON.stringify({ raw: base, tiktok_name: match.winner, auction_winner: match.winner, auction_price: match.price, auction_linked_at: new Date().toISOString() }));
    }
  });
}

// ─── API Routes (protegidas por API key) ────────────────────────────────────
app.post('/api/v1/order/detect', validateClientSignature, validateApiKey, (req, res) => {
  const { order_id, cliente, precio, moneda, fecha_pedido, raw } = req.body;
  if (!order_id) return res.status(400).json({ error: 'order_id requerido' });

  db.get(`SELECT * FROM pedidos WHERE id_usuario = ? AND order_id = ?`, [req.usuario.id_usuario, order_id], (err, existing) => {
    if (existing) return res.json({ status: 'duplicate', tk: existing.tk });

    generateTK(req.usuario.id_usuario, (err, tk) => {
      const id = uuidv4();
      const nowIso = new Date().toISOString();
      const normalizedFechaPedido = fecha_pedido || nowIso;
      enrichRawWithAuctionWinner(req.usuario.id_usuario, precio, raw || '', (enrichedRaw) => {
        db.run(`INSERT INTO pedidos (id_pedido, id_usuario, tk, order_id, cliente, precio, moneda, fecha_pedido, estado_impresion, impresiones_cobrables, raw_detectado)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'detectado', 0, ?)`,
          [id, req.usuario.id_usuario, tk, order_id, cliente || '', precio || 0, moneda || 'EUR', normalizedFechaPedido, enrichedRaw || ''],
          function() {
            generateLabelHTML(req.usuario.id_usuario, tk, order_id, cliente, precio, moneda, normalizedFechaPedido, (html) => {
              res.json({ status: 'ok', tk, label_html: html, billing: { ok: true, skipped: true, reason: 'detected_not_printed_yet' }, charged_prints: 0 });
            }, enrichedRaw || '');
          }
        );
      });
    });
  });
});

app.get('/api/v1/orders', authJWT, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  db.all(`SELECT * FROM pedidos WHERE id_usuario = ? AND datetime(fecha_detectado) >= datetime('now','-4 months') ORDER BY fecha_detectado DESC LIMIT ? OFFSET ?`,
    [req.usuario.id_usuario, limit, offset], (err, rows) => {
    db.get(`SELECT COUNT(*) as total FROM pedidos WHERE id_usuario = ? AND datetime(fecha_detectado) >= datetime('now','-4 months')`, [req.usuario.id_usuario], (err, count) => {
      res.json({ items: rows, total: count.total, page, limit });
    });
  });
});

function chargeFirstPrintIfNeeded(usuario, order, rawPayload, cb) {
  const alreadyCharged = Number(order.impresiones_cobrables || 0) > 0;
  if (alreadyCharged) return cb({ ok: true, skipped: true, reason: 'already_charged_first_print' }, false, Number(order.impresiones_cobrables || 0));
  const nowIso = new Date().toISOString();
  db.run(`UPDATE pedidos SET impresiones_cobrables = 1, estado_impresion = CASE WHEN estado_impresion = 'detectado' THEN 'impreso' ELSE estado_impresion END, fecha_impresion = COALESCE(fecha_impresion, ?), ultimo_cobro_impresion = ? WHERE id_pedido = ?`, [nowIso, nowIso, order.id_pedido], async () => {
    const billing = await syncBillablePrintToSupabase(usuario, { order_id: order.order_id, tk: order.tk, raw_payload: rawPayload || { tk: order.tk, action: 'first_print' }, price_cents: 10, print_index: 1 }, 'print');
    cb(billing, true, 1);
  });
}

function ensurePrintInvariant(order) {
  if (!order?.id_pedido) return;
  if (Number(order.reimpresiones || 0) > 0 && Number(order.impresiones_cobrables || 0) === 0) {
    const stamp = order.fecha_impresion || order.fecha_detectado || new Date().toISOString();
    db.run(`UPDATE pedidos SET impresiones_cobrables = 1, ultimo_cobro_impresion = COALESCE(ultimo_cobro_impresion, ?), fecha_impresion = COALESCE(fecha_impresion, ?) WHERE id_pedido = ?`, [stamp, stamp, order.id_pedido]);
  }
}

app.post('/api/v1/orders/:tk/mark-print', authJWT, (req, res) => {
  db.get(`SELECT * FROM pedidos WHERE id_usuario = ? AND tk = ?`, [req.usuario.id_usuario, req.params.tk], (err, order) => {
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    chargeFirstPrintIfNeeded(req.usuario, order, { tk: order.tk, action: 'manual_print_from_label' }, (billing, chargedThisAction, chargedPrints) => {
      res.json({ status: 'ok', tk: order.tk, billing, charged_this_action: chargedThisAction, charged_prints: chargedPrints });
    });
  });
});

app.post('/api/v1/orders/:tk/mark-print-api', validateClientSignature, validateApiKey, (req, res) => {
  db.get(`SELECT * FROM pedidos WHERE id_usuario = ? AND tk = ?`, [req.usuario.id_usuario, req.params.tk], (err, order) => {
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    chargeFirstPrintIfNeeded(req.usuario, order, { tk: order.tk, action: req.body?.action || 'extension_print_invoked' }, (billing, chargedThisAction, chargedPrints) => {
      res.json({ status: 'ok', tk: order.tk, billing, charged_this_action: chargedThisAction, charged_prints: chargedPrints });
    });
  });
});

app.post('/api/v1/orders/:tk/reprint', authJWT, (req, res) => {
  db.get(`SELECT * FROM pedidos WHERE id_usuario = ? AND tk = ?`, [req.usuario.id_usuario, req.params.tk], (err, order) => {
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    ensurePrintInvariant(order);
    const nowIso = new Date().toISOString();
    const alreadyCharged = Number(order.impresiones_cobrables || 0) > 0 || Number(order.reimpresiones || 0) > 0;
    db.run(`UPDATE pedidos SET reimpresiones = reimpresiones + 1, estado_impresion = 'reimpreso', fecha_impresion = ? WHERE id_pedido = ?`, [nowIso, order.id_pedido], () => {
      generateLabelHTML(req.usuario.id_usuario, order.tk, order.order_id, order.cliente, order.precio, order.moneda, order.fecha_pedido, (html) => {
        res.json({ status: 'ok', tk: order.tk, label_html: html, billing: { ok: true, skipped: true, reason: 'reprint_label_generated_print_charge_separate' }, charged_prints: Number(order.impresiones_cobrables || 0), charged_this_action: false });
      }, order.raw_detectado || '');
    });
  });
});

app.get('/api/v1/label/:tk.html', authJWT, (req, res) => {
  db.get(`SELECT * FROM pedidos WHERE id_usuario = ? AND tk = ?`, [req.usuario.id_usuario, req.params.tk], (err, order) => {
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    generateLabelHTML(req.usuario.id_usuario, order.tk, order.order_id, order.cliente, order.precio, order.moneda, order.fecha_pedido, (html) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    }, order.raw_detectado || '');
  });
});


const labelConfigFields = ['label_width_mm','label_height_mm','orientation','qr_size_mm','title_font_pt','tk_font_pt',
  'customer_font_pt','tiktok_font_pt','order_font_pt','price_font_pt','date_font_pt','show_tk','show_title','show_date','padding_mm',
  'show_cliente','show_tiktok_name','show_order_id','show_price','show_auction','show_datetime','show_qr','order_auction','order_cliente','order_tiktok_name','order_order_id','order_price','order_datetime','label_font_pt','default_template','line_spacing_mm','title_data_gap_mm','letter_spacing_pt','label_col_width_mm','column_gap_mm','auto_print_enabled','seller_refresh_seconds'];
function pickLabelConfig(body) {
  const out = {};
  for (const f of labelConfigFields) if (body[f] !== undefined) out[f] = body[f];
  return out;
}
function defaultLabelConfig() {
  return { label_width_mm: 60, label_height_mm: 29, orientation: 'landscape', qr_size_mm: 13, padding_mm: 1, title_font_pt: 9, tk_font_pt: 7, customer_font_pt: 8.4, tiktok_font_pt: 8.4, order_font_pt: 7, price_font_pt: 10.5, date_font_pt: 5.4, show_tk: 1, show_title: 1, show_date: 1, show_cliente: 1, show_tiktok_name: 1, show_order_id: 1, show_price: 1, show_auction: 1, show_datetime: 1, show_qr: 1, order_auction: 1, order_cliente: 2, order_tiktok_name: 3, order_order_id: 4, order_price: 5, order_datetime: 6, label_font_pt: 10, default_template: 1, line_spacing_mm: 3, title_data_gap_mm: 1, letter_spacing_pt: 0, label_col_width_mm: 24, column_gap_mm: 2, auto_print_enabled: 1, seller_refresh_seconds: 15 };
}
function upsertActiveLabelConfig(idUsuario, config, cb) {
  const data = pickLabelConfig(config);
  const fields = Object.keys(data);
  if (!fields.length) return cb && cb(null);
  db.get(`SELECT id_config FROM configuracion_plantilla WHERE id_usuario = ?`, [idUsuario], (err, row) => {
    if (err) return cb && cb(err);
    if (!row) {
      const id = uuidv4();
      const cols = ['id_config','id_usuario', ...fields];
      const qs = cols.map(() => '?').join(',');
      return db.run(`INSERT INTO configuracion_plantilla (${cols.join(',')}) VALUES (${qs})`, [id, idUsuario, ...fields.map(f => data[f])], cb);
    }
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.run(`UPDATE configuracion_plantilla SET ${sets} WHERE id_usuario = ?`, [...fields.map(f => data[f]), idUsuario], cb);
  });
}

app.get('/api/v1/label-templates', authJWT, (req, res) => {
  db.all(`SELECT id_template, nombre, is_default, created_at, updated_at FROM plantillas_etiqueta WHERE id_usuario = ? ORDER BY is_default DESC, updated_at DESC`, [req.usuario.id_usuario], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error cargando plantillas' });
    res.json({ items: rows || [] });
  });
});

app.get('/api/v1/label-templates/:id', authJWT, (req, res) => {
  db.get(`SELECT * FROM plantillas_etiqueta WHERE id_usuario = ? AND id_template = ?`, [req.usuario.id_usuario, req.params.id], (err, tpl) => {
    if (err || !tpl) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json({ id_template: tpl.id_template, nombre: tpl.nombre, is_default: tpl.is_default, config: JSON.parse(tpl.config_json || '{}') });
  });
});

app.post('/api/v1/label-templates', authJWT, (req, res) => {
  const nombre = String(req.body.nombre || 'Plantilla').trim().slice(0, 80) || 'Plantilla';
  const config = pickLabelConfig(req.body.config || req.body || {});
  const id = uuidv4();
  const isDefault = Number(req.body.is_default || 0) === 1 ? 1 : 0;
  db.serialize(() => {
    if (isDefault) db.run(`UPDATE plantillas_etiqueta SET is_default = 0 WHERE id_usuario = ?`, [req.usuario.id_usuario]);
    db.run(`INSERT INTO plantillas_etiqueta (id_template, id_usuario, nombre, config_json, is_default) VALUES (?, ?, ?, ?, ?)`, [id, req.usuario.id_usuario, nombre, JSON.stringify(config), isDefault], (err) => {
      if (err) return res.status(500).json({ error: 'No se pudo guardar plantilla' });
      if (!isDefault) return res.json({ status: 'ok', id_template: id });
      upsertActiveLabelConfig(req.usuario.id_usuario, config, () => res.json({ status: 'ok', id_template: id }));
    });
  });
});

app.put('/api/v1/label-templates/:id', authJWT, (req, res) => {
  const nombre = String(req.body.nombre || 'Plantilla').trim().slice(0, 80) || 'Plantilla';
  const config = pickLabelConfig(req.body.config || req.body || {});
  db.run(`UPDATE plantillas_etiqueta SET nombre = ?, config_json = ?, updated_at = datetime('now') WHERE id_usuario = ? AND id_template = ?`, [nombre, JSON.stringify(config), req.usuario.id_usuario, req.params.id], function(err) {
    if (err || this.changes === 0) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json({ status: 'ok' });
  });
});

app.post('/api/v1/label-templates/:id/default', authJWT, (req, res) => {
  db.get(`SELECT * FROM plantillas_etiqueta WHERE id_usuario = ? AND id_template = ?`, [req.usuario.id_usuario, req.params.id], (err, tpl) => {
    if (err || !tpl) return res.status(404).json({ error: 'Plantilla no encontrada' });
    const config = JSON.parse(tpl.config_json || '{}');
    db.serialize(() => {
      db.run(`UPDATE plantillas_etiqueta SET is_default = 0 WHERE id_usuario = ?`, [req.usuario.id_usuario]);
      db.run(`UPDATE plantillas_etiqueta SET is_default = 1, updated_at = datetime('now') WHERE id_usuario = ? AND id_template = ?`, [req.usuario.id_usuario, req.params.id]);
      upsertActiveLabelConfig(req.usuario.id_usuario, config, (upErr) => {
        if (upErr) return res.status(500).json({ error: 'No se pudo activar plantilla' });
        res.json({ status: 'ok', config });
      });
    });
  });
});

app.get('/api/v1/config', authJWT, (req, res) => {
  db.get(`SELECT * FROM configuracion_plantilla WHERE id_usuario = ?`, [req.usuario.id_usuario], (err, config) => {
    if (!config) {
      const id = uuidv4();
      db.run(`INSERT INTO configuracion_plantilla (id_config, id_usuario) VALUES (?, ?)`, [id, req.usuario.id_usuario]);
      return res.json(defaultLabelConfig());
    }
    res.json(config);
  });
});

app.put('/api/v1/config', authJWT, (req, res) => {
  const fields = labelConfigFields;
  const sets = fields.filter(f => req.body[f] !== undefined).map(f => `${f} = ?`).join(', ');
  const vals = fields.filter(f => req.body[f] !== undefined).map(f => req.body[f]);
  if (!sets) return res.status(400).json({ error: 'Sin campos para actualizar' });
  db.run(`UPDATE configuracion_plantilla SET ${sets} WHERE id_usuario = ?`, [...vals, req.usuario.id_usuario], function() {
    res.json({ status: 'ok' });
  });
});

app.get('/api/v1/profile', authJWT, (req, res) => {
  res.json({
    id_usuario: req.usuario.id_usuario,
    email: req.usuario.email,
    nombre: req.usuario.nombre,
    api_key: req.usuario.api_key,
    suscripcion_activa: req.usuario.suscripcion_activa,
    fecha_expiracion: req.usuario.fecha_expiracion,
    stripe_customer_id: req.usuario.stripe_customer_id,
  });
});

app.get('/api/v1/profile/api-key', validateApiKey, (req, res) => {
  db.get(`SELECT u.creditos, COALESCE(c.auto_print_enabled, 1) AS auto_print_enabled, COALESCE(c.seller_refresh_seconds, 15) AS seller_refresh_seconds
    FROM usuarios u
    LEFT JOIN configuracion_plantilla c ON c.id_usuario = u.id_usuario
    WHERE u.id_usuario = ?`, [req.usuario.id_usuario], (err, user) => {
    res.json({
      id_usuario: req.usuario.id_usuario,
      email: req.usuario.email,
      nombre: req.usuario.nombre,
      api_key: req.usuario.api_key,
      suscripcion_activa: req.usuario.suscripcion_activa,
      fecha_expiracion: req.usuario.fecha_expiracion,
      stripe_customer_id: req.usuario.stripe_customer_id,
      creditos: user?.creditos || 0,
      auto_print_enabled: user?.auto_print_enabled !== 0 ? 1 : 0,
      seller_refresh_seconds: Math.max(15, Math.min(300, Number(user?.seller_refresh_seconds || 15))),
    });
  });
});

app.get('/api/billing/summary', authJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado' });
  const { period_start, period_end } = getBillingPeriodDates();
  const { data, error } = await supabase
    .from('billing_periods')
    .select('*')
    .eq('tenant_id', req.usuario.id_usuario)
    .eq('period_start', period_start)
    .eq('period_end', period_end)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    period_start,
    period_end,
    price_per_order_cents: 10,
    charge_threshold_cents: 1000,
    orders_count: data?.orders_count || 0,
    amount_cents: data?.amount_cents || 0,
    status: data?.status || 'open',
    next_charge_at_cents: 1000,
  });
});

app.put('/api/billing/fiscal-data', authJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado' });
  const allowed = ['business_name', 'tax_id', 'billing_email', 'fiscal_address', 'city', 'province', 'postal_code'];
  const update = {};
  for (const field of allowed) if (req.body[field] !== undefined) update[field] = req.body[field];
  update.country = 'ES';
  update.updated_at = new Date().toISOString();
  const { error } = await supabase.from('tenants').update(update).eq('id', req.usuario.id_usuario);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ status: 'ok' });
});

app.post('/api/legal/accept', authJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado' });
  const termsVersion = req.body.terms_version || '2026-05-15-v1';
  const privacyVersion = req.body.privacy_version || '2026-05-15-v1';
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim() || null;
  const userAgent = req.headers['user-agent'] || null;
  const { error } = await supabase.from('terms_acceptances').insert({
    tenant_id: req.usuario.id_usuario,
    user_id: req.usuario.id_usuario,
    terms_version: termsVersion,
    privacy_version: privacyVersion,
    accepted_price_cents: 10,
    accepted_currency: 'EUR',
    ip_address: ip,
    user_agent: userAgent,
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ status: 'ok', terms_version: termsVersion, privacy_version: privacyVersion, accepted_price_cents: 10 });
});

app.get('/api/legal/status', authJWT, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado' });
  const { data, error } = await supabase
    .from('terms_acceptances')
    .select('terms_version, privacy_version, accepted_price_cents, accepted_at')
    .eq('tenant_id', req.usuario.id_usuario)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ accepted: !!data, latest: data || null });
});

app.get('/api/supabase/health', async (req, res) => {
  const status = await verifySupabaseConnection();
  res.status(status.ok ? 200 : 500).json(status);
});

// ─── Extension remote config ────────────────────────────────────────────────
app.get('/api/extension/config', (req, res) => {
  res.json({
    configVersion: '2026-05-19-seller-autorefresh-001',
    apiBase: 'https://etiquetalive.satecnic.es',
    enableApiReplay: true,
    enableControlledRefreshFallback: true,
    backgroundPollIntervalMs: 15000,
    forceBackgroundPollIntervalMs: 30000,
    domScanIntervalMs: 5000,
    mutationDebounceMs: 1800,
    controlledRefreshAfterMs: 15000,
    controlledRefreshCooldownMs: 15000,
    maxVisibleOrders: 12,
    maxCapturedRequests: 8,
    maxReplayRequestsPerPoll: 3,
    maxApiOrdersPerScan: 20,
    extensionConfigRefreshMs: 300000,
    minExtensionVersion: '1.2.0',
    updateMessage: ''
  });
});

// ─── Health ─────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  verifySupabaseConnection().then((supabaseStatus) => {
    res.json({ ok: true, service: 'etiquetalive', version: '1.3.0', stripe: !!stripe, supabase: supabaseStatus });
  });
});

function formatEtiquetaDate(value) {
  if (!value) return '—';
  const raw = String(value).trim();
  const es = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/);
  if (es) {
    const [, d, m, y, hh = '00', mm = '00'] = es;
    return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y} ${String(hh).padStart(2,'0')}:${mm}`;
  }
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function extractTikTokName(raw, fallback) {
  if (!raw) return fallback || '';
  const pick = (data) => {
    const keys = ['tiktok_name','tiktokName','auction_winner','winner','tiktok_username','username','user_name','buyer_username','buyer_name','nickname','nickName','display_name'];
    for (const key of keys) {
      if (data && data[key]) return data[key];
      if (data?.buyer && data.buyer[key]) return data.buyer[key];
      if (data?.customer && data.customer[key]) return data.customer[key];
      if (data?.user && data.user[key]) return data.user[key];
      if (data?.event && data.event[key]) return data.event[key];
    }
    return '';
  };
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const direct = pick(data);
    if (direct) return String(direct).trim().slice(0, 80);
  } catch(e) {}
  const text = String(raw || '');
  const winner = text.match(/(?:Ganador(?:a)?\s+de\s+esta\s+ronda|winner|ganador|comprador|buyer)\s*[:：-]\s*@?([\p{L}\p{N}_.\-]{2,80})/iu);
  if (winner?.[1]) return winner[1].trim().slice(0, 80);
  return fallback || '';
}
// ─── Label Generator ────────────────────────────────────────────────────────
function generateLabelHTML(id_usuario, tk, order_id, cliente, precio, moneda, fecha_pedido, cb, raw_detectado = '') {
  db.get(`SELECT * FROM configuracion_plantilla WHERE id_usuario = ?`, [id_usuario], (err, config) => {
    const c = config || {};
    const w = c.label_width_mm || 60;
    const h = c.label_height_mm || 29;
    const qrSize = c.qr_size_mm || 13;
    const titlePt = c.title_font_pt || 5;
    const tkPt = c.tk_font_pt || 7;
    const custPt = c.customer_font_pt || 8.4;
    const pricePt = c.price_font_pt || 10.5;
    const datePt = c.date_font_pt || 5.4;
    const showTK = c.show_tk !== 0;
    const showTitle = c.show_title !== 0;
    const showDate = c.show_date !== 0;
    const showCliente = c.show_cliente !== 0;
    const showTikTokName = c.show_tiktok_name !== 0;
    const showOrderId = c.show_order_id !== 0;
    const showPrice = c.show_price !== 0;
    const showAuction = c.show_auction !== 0;
    const showDateTime = c.show_datetime !== 0;
    const showQr = c.show_qr !== 0;
    const labelFontPt = c.label_font_pt || 10;
    const auctionPt = c.title_font_pt || 9;
    const clientePt = c.customer_font_pt || labelFontPt;
    const tiktokPt = c.tiktok_font_pt || clientePt;
    const orderPt = c.order_font_pt || c.tk_font_pt || 7;
    const lineSpacingMm = c.line_spacing_mm ?? 1.4;
    const titleDataGapMm = c.title_data_gap_mm || 0;
    const letterSpacingPt = c.letter_spacing_pt || 0;
    const labelColWidthMm = c.label_col_width_mm || 24;
    const columnGapMm = c.column_gap_mm ?? 2;
    const pad = c.padding_mm ?? 1;

    const priceStr = precio ? `${Number(precio).toFixed(2)} ${moneda || 'EUR'}` : '—';
    const dateStr = formatEtiquetaDate(fecha_pedido);
    const qrPayload = String(order_id || tk || '');
    const tiktokName = extractTikTokName(raw_detectado, '');
    const rows = [
      { key: 'auction', enabled: showAuction, order: Number(c.order_auction || 1), html: '<div class="title">SUBASTA</div>' },
      { key: 'cliente', enabled: showCliente, order: Number(c.order_cliente || 2), html: `<div class="row cliente autofit-row"><b>Cliente</b><span class="autofit-text">${escapeHtml(cliente || '')}</span></div>` },
      { key: 'tiktok', enabled: showTikTokName, order: Number(c.order_tiktok_name || 3), html: `<div class="row tiktok autofit-row"><b>TikTok</b><span class="autofit-text">${escapeHtml(tiktokName || '')}</span></div>` },
      { key: 'order', enabled: showOrderId, order: Number(c.order_order_id || 4), html: `<div class="row order"><b>Nº Pedido</b><span>${escapeHtml(order_id || '')}</span></div>` },
      { key: 'price', enabled: showPrice, order: Number(c.order_price || 5), html: `<div class="row price"><b>Precio</b><span>${escapeHtml(priceStr)}</span></div>` },
      { key: 'fecha', enabled: showDateTime, order: Number(c.order_datetime || 6), html: `<div class="row fecha"><b>Fecha</b><span>${escapeHtml(dateStr)}</span></div>` }
    ].filter(r => r.enabled).sort((a,b) => a.order - b.order).map(r => r.html);

    QRCode.toDataURL(qrPayload, { margin: 0, width: 240, errorCorrectionLevel: 'M' }, (qrErr, qrDataUrl) => {
      const qrSrc = qrErr
        ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrPayload)}`
        : qrDataUrl;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page { size: ${w}mm ${h}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${w}mm; height: ${h}mm; display: flex; font-family: Arial, sans-serif; overflow: hidden; color:#111; }
  .label { display: flex; align-items: center; gap: 1mm; width: 100%; height: 100%; padding: ${pad}mm; letter-spacing: ${letterSpacingPt}pt; line-height: 1.12; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: ${lineSpacingMm}mm; font-size: ${labelFontPt}pt; overflow:hidden; }
  .qr-area { display: flex; align-items: center; justify-content: center; width: ${showQr ? qrSize : 0}mm; height: ${showQr ? qrSize : 0}mm; flex: 0 0 auto; }
  .qr-area img { width: ${qrSize}mm; height: ${qrSize}mm; display: block; image-rendering: pixelated; }
  @media print { img, .label { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  .title { font-size: ${auctionPt}pt; font-weight: 900; color: #111; text-transform: uppercase; letter-spacing: ${Math.max(Number(letterSpacingPt || 0), 0.6)}pt; border: 1px solid #111; width: max-content; padding: 1mm 2mm; border-radius: 1mm; margin-bottom: ${titleDataGapMm}mm; }
  .row { display:grid; grid-template-columns:${labelColWidthMm}mm 1fr; column-gap:${columnGapMm}mm; align-items:baseline; min-width:0; }
  .cliente { font-size: ${clientePt}pt; }
  .tiktok { font-size: ${tiktokPt}pt; }
  .order { font-size: ${orderPt}pt; }
  .price { font-size: ${pricePt}pt; }
  .fecha { font-size: ${datePt}pt; }
  .row b { font-weight:900; min-width: 0; }
  .row span { font-weight:600; overflow:hidden; white-space:nowrap; }
  .autofit-text { display:block; min-width:0; }
  .tk { font-size: ${tkPt}pt; font-weight: bold; margin: 1pt 0; }
  .order-id { font-size: ${custPt * 0.7}pt; color: #666; }
  .customer { font-size: ${custPt}pt; font-weight: bold; }
  .price { font-size: ${pricePt}pt; font-weight: bold; color: #2e7d32; }
  .date { font-size: ${datePt}pt; color: #999; }
</style></head><body>
<div class="label">
  <div class="info">
    ${rows.join('') || '<div class="row"><span>Etiqueta sin campos activos</span></div>'}
  </div>
  ${showQr ? `<div class="qr-area"><img src="${qrSrc}" alt="QR" /></div>` : ''}
</div>

<script>
(function(){
  function fitAutoText(){
    document.querySelectorAll('.autofit-text').forEach(function(el){
      el.style.fontSize = '';
      var size = parseFloat(getComputedStyle(el).fontSize) || 10;
      var min = 6;
      var guard = 0;
      while (el.scrollWidth > el.clientWidth && size > min && guard < 24) {
        size -= 0.5;
        el.style.fontSize = size + 'px';
        guard++;
      }
    });
  }
  window.addEventListener('load', fitAutoText);
  window.addEventListener('beforeprint', fitAutoText);
  setTimeout(fitAutoText, 80);
})();
</script>
<script>
(function(){
  let marked = false;
  async function markFirstPrint(){
    if (marked) return; marked = true;
    try {
      const token = localStorage.getItem('el_token');
      if (!token) return;
      await fetch('/api/v1/orders/${tk}/mark-print', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
    } catch(e) {}
  }
  window.addEventListener('beforeprint', markFirstPrint);
})();
</script>
</body></html>`;
      cb(html);
    });
  });
}

// ─── Dashboard (servir frontend build) ──────────────────────────────────────
app.get('/api/admin/stats', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== 'el_admin_satecnic_2026') {
    return res.status(401).json({ error: 'No autorizado' });
  }
  db.all(`SELECT p.tk, p.order_id, p.cliente, p.precio, p.moneda, p.estado_impresion, p.fecha_pedido, p.fecha_detectado, p.fecha_impresion, COALESCE(p.impresiones_cobrables,0) AS impresiones_cobrables, p.reimpresiones, u.email as usuario
    FROM pedidos p JOIN usuarios u ON p.id_usuario = u.id_usuario
    WHERE datetime(p.fecha_detectado) >= datetime('now','-4 months')
    ORDER BY p.fecha_detectado DESC LIMIT 200`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`SELECT COUNT(*) as total FROM pedidos WHERE datetime(fecha_detectado) >= datetime('now','-4 months')`, [], (err2, totalPedidos) => {
      db.get(`SELECT COUNT(*) as total FROM usuarios`, [], (err3, totalUsuarios) => {
        db.get(`SELECT COALESCE(SUM(impresiones_cobrables),0) as total_impresiones, COALESCE(SUM(reimpresiones),0) as total_reimpresiones FROM pedidos WHERE datetime(fecha_detectado) >= datetime('now','-4 months')`, [], (err4, totalPrints) => {
          db.all(`SELECT u.id_usuario, u.email, u.nombre,
              COUNT(p.id_pedido) AS pedidos_detectados,
              COALESCE(SUM(p.impresiones_cobrables),0) AS impresiones_cobrables,
              COALESCE(SUM(p.reimpresiones),0) AS reimpresiones,
              COALESCE(SUM(p.impresiones_cobrables),0) * 10 AS importe_cents
            FROM usuarios u
            LEFT JOIN pedidos p ON p.id_usuario = u.id_usuario AND datetime(p.fecha_detectado) >= datetime('now','-4 months')
            GROUP BY u.id_usuario, u.email, u.nombre
            ORDER BY impresiones_cobrables DESC, pedidos_detectados DESC`, [], (err5, clientes) => {
            res.json({
              pedidos: rows,
              clientes: clientes || [],
              resumen: {
                total_pedidos: totalPedidos?.total || 0,
                total_usuarios: totalUsuarios?.total || 0,
                total_impresiones: totalPrints?.total_impresiones || 0,
                total_reimpresiones: totalPrints?.total_reimpresiones || 0,
                total_facturable_cents: (totalPrints?.total_impresiones || 0) * 10
              }
            });
          });
        });
      });
    });
  });
});

app.get('/api/admin/usuarios', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== 'el_admin_satecnic_2026') {
    return res.status(401).json({ error: 'No autorizado' });
  }
  db.all(`SELECT u.id_usuario, u.email, u.nombre, u.suscripcion_activa, u.creditos, u.fecha_registro,
      COUNT(p.id_pedido) AS pedidos_detectados,
      COALESCE(SUM(p.impresiones_cobrables),0) AS impresiones_cobrables,
      COALESCE(SUM(p.reimpresiones),0) AS reimpresiones,
      COALESCE(SUM(p.impresiones_cobrables),0) * 10 AS importe_cents
    FROM usuarios u
    LEFT JOIN pedidos p ON p.id_usuario = u.id_usuario AND datetime(p.fecha_detectado) >= datetime('now','-4 months')
    GROUP BY u.id_usuario
    ORDER BY u.fecha_registro DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ usuarios: rows });
  });
});

app.use(express.static(path.join(__dirname, '../frontend')));

app.use(express.static(path.join(__dirname, '../frontend')));

// SPA fallback: serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/stripe/')) return;
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`EtiquetaLive API running on port ${PORT}`);
  console.log(`Stripe: ${stripe ? '✅ configurado' : '⚠️ NO configurado'}`);
  console.log(`DB: ${DB_PATH}`);
  console.log(`Supabase: ${supabase ? 'OK configurado' : 'NO configurado'}`);
});

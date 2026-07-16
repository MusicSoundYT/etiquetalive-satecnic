"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { inputClass, buttonClass, ErrorText } from "@/components/auth-shell";
import { DEFAULT_TEMPLATE_VALUES, type LabelTemplate } from "@/lib/labels/types";

type FieldsOnly = Omit<LabelTemplate, "id" | "tenant_id" | "nombre" | "is_default">;

// Conversión estándar CSS (96px = 1in = 25.4mm), la misma que usa el navegador
// para renderizar unidades "mm" — con esto el tamaño en pantalla del iframe y
// el de su contenido (ambos en mm) siempre coinciden exactamente.
const MM_TO_PX = 96 / 25.4;
const MAX_PREVIEW_PX = 260;

const FIELD_LABELS: Record<string, string> = {
  auction: "Subasta",
  cliente: "Cliente",
  tiktok_name: "Nombre TikTok",
  order_id: "Nº Pedido",
  price: "Precio",
  datetime: "Fecha y hora",
};

function checkboxRow(
  fields: FieldsOnly,
  setFields: (f: FieldsOnly) => void,
  key: "show_auction" | "show_cliente" | "show_tiktok_name" | "show_order_id" | "show_price" | "show_datetime",
  orderKey: "order_auction" | "order_cliente" | "order_tiktok_name" | "order_order_id" | "order_price" | "order_datetime",
  fieldKey: string
) {
  return (
    <div key={key} className="flex items-center justify-between gap-3 py-1.5">
      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={fields[key]}
          onChange={(e) => setFields({ ...fields, [key]: e.target.checked })}
        />
        {FIELD_LABELS[fieldKey]}
      </label>
      <input
        type="number"
        min={1}
        max={6}
        value={fields[orderKey]}
        onChange={(e) => setFields({ ...fields, [orderKey]: Number(e.target.value) })}
        className="w-16 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </div>
  );
}

function numberField(
  label: string,
  fields: FieldsOnly,
  setFields: (f: FieldsOnly) => void,
  key: keyof FieldsOnly,
  step = 0.1
) {
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{label}</label>
      <input
        type="number"
        step={step}
        value={fields[key] as number}
        onChange={(e) => setFields({ ...fields, [key]: Number(e.target.value) })}
        className={inputClass}
      />
    </div>
  );
}

export function TemplateDesigner({ initialTemplates }: { initialTemplates: LabelTemplate[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const defaultTpl = initialTemplates.find((t) => t.is_default) ?? initialTemplates[0];
  const [selectedId, setSelectedId] = useState(defaultTpl?.id ?? "");
  const [nombre, setNombre] = useState(defaultTpl?.nombre ?? "Plantilla");
  const [fields, setFields] = useState<FieldsOnly>(() => {
    if (!defaultTpl) return DEFAULT_TEMPLATE_VALUES;
    const { id: _id, tenant_id: _tenantId, nombre: _nombre, is_default: _isDefault, ...rest } = defaultTpl;
    return rest;
  });
  const [previewHtml, setPreviewHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sin plantilla seleccionada (tras "Nueva plantilla" o al borrar la última):
  // el formulario está "en blanco" y "Guardar cambios" no tiene nada que
  // actualizar, así que solo se puede guardar vía "Guardar como nueva".
  const isNew = selectedId === "";

  // Escala puramente visual: agranda/reduce TODAS las medidas de la etiqueta
  // (mm y pt) por igual, para que la vista previa ocupe un hueco razonable en
  // pantalla sin perder la proporción real. El servidor aplica esta misma
  // escala al generar el HTML de prueba, y aquí se usa la conversión CSS
  // estándar (mm→px) para que el marco del iframe y su contenido —ambos en
  // mm— coincidan exactamente, sin huecos en blanco alrededor.
  const previewScale = Math.min(
    MAX_PREVIEW_PX / (Math.max(fields.label_width_mm, 1) * MM_TO_PX),
    MAX_PREVIEW_PX / (Math.max(fields.label_height_mm, 1) * MM_TO_PX)
  );
  const previewSize = {
    widthMm: fields.label_width_mm * previewScale,
    heightMm: fields.label_height_mm * previewScale,
  };

  const refreshPreview = useCallback((f: FieldsOnly, scale: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const res = await fetch("/api/templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: f, previewScale: scale }),
      });
      if (res.ok) setPreviewHtml(await res.text());
    }, 300);
  }, []);

  useEffect(() => {
    refreshPreview(fields, previewScale);
  }, [fields, previewScale, refreshPreview]);

  function updateFields(f: FieldsOnly) {
    setFields(f);
  }

  // Se extraen solo los campos de FieldsOnly (y no el objeto entero de la
  // plantilla): "fields" nunca debe llevar nombre/id/tenant_id/is_default,
  // porque un "{ nombre, ...fields }" con fields.nombre presente sobrescribiría
  // silenciosamente el nombre editado por el usuario con el nombre antiguo.
  function extractFields(t: LabelTemplate): FieldsOnly {
    const { id: _id, tenant_id: _tenantId, nombre: _nombre, is_default: _isDefault, ...rest } = t;
    return rest;
  }

  function loadTemplate(id: string) {
    const t = templates.find((tpl) => tpl.id === id);
    if (!t) return;
    setSelectedId(id);
    setNombre(t.nombre);
    setFields(extractFields(t));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // "nombre" va el último para que siempre gane sobre cualquier campo
        // homónimo que pudiera colarse en "fields".
        body: JSON.stringify({ ...fields, nombre }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "No se pudo guardar.");
      setTemplates((prev) => prev.map((t) => (t.id === selectedId ? data.template : t)));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAsNew() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, nombre }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "No se pudo guardar.");
      setTemplates((prev) => [data.template, ...prev]);
      setSelectedId(data.template.id);
    } finally {
      setSaving(false);
    }
  }

  async function handleSetDefault() {
    setError(null);
    const res = await fetch(`/api/templates/${selectedId}/default`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "No se pudo marcar como predeterminada.");
    setTemplates((prev) => prev.map((t) => ({ ...t, is_default: t.id === selectedId })));
  }

  // Deja el formulario en blanco (valores de fábrica) sin tocar ninguna
  // plantilla existente, para que el usuario no pueda confundirse y sobrescribir
  // la plantilla actual pensando que está creando una nueva.
  function handleNewTemplate() {
    setError(null);
    setSelectedId("");
    setNombre("Nueva plantilla");
    setFields(DEFAULT_TEMPLATE_VALUES);
  }

  async function handleDelete() {
    if (isNew) return;
    const current = templates.find((t) => t.id === selectedId);
    if (current?.is_default) {
      setError("No puedes borrar la plantilla predeterminada.");
      return;
    }
    if (!window.confirm(`¿Borrar la plantilla "${nombre}"? Esta acción no se puede deshacer.`)) return;

    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${selectedId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "No se pudo borrar la plantilla.");

      const remaining = templates.filter((t) => t.id !== selectedId);
      setTemplates(remaining);
      const next = remaining.find((t) => t.is_default) ?? remaining[0];
      if (next) {
        setSelectedId(next.id);
        setNombre(next.nombre);
        setFields(extractFields(next));
      } else {
        handleNewTemplate();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Plantillas guardadas</label>
          <select
            value={selectedId}
            onChange={(e) => loadTemplate(e.target.value)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {isNew && <option value="">{nombre || "Nueva plantilla"} (sin guardar)</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
                {t.is_default ? " · predeterminada" : ""}
              </option>
            ))}
          </select>
          <label className="mb-1 mt-3 block text-xs text-zinc-500 dark:text-zinc-400">
            Nombre {isNew && "(nueva plantilla, aún sin guardar)"}
          </label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} />
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Campos a imprimir y orden
          </h3>
          {checkboxRow(fields, updateFields, "show_auction", "order_auction", "auction")}
          {fields.show_auction && (
            <div className="mb-1.5 mt-1 pl-6">
              <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                Texto de la etiqueta superior
              </label>
              <input
                value={fields.auction_label_text}
                onChange={(e) => updateFields({ ...fields, auction_label_text: e.target.value })}
                maxLength={30}
                placeholder="SUBASTA"
                className={inputClass}
              />
            </div>
          )}
          {checkboxRow(fields, updateFields, "show_cliente", "order_cliente", "cliente")}
          {checkboxRow(fields, updateFields, "show_tiktok_name", "order_tiktok_name", "tiktok_name")}
          {checkboxRow(fields, updateFields, "show_order_id", "order_order_id", "order_id")}
          {checkboxRow(fields, updateFields, "show_price", "order_price", "price")}
          {checkboxRow(fields, updateFields, "show_datetime", "order_datetime", "datetime")}
          <label className="mt-2 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={fields.show_qr}
              onChange={(e) => updateFields({ ...fields, show_qr: e.target.checked })}
            />
            Código QR
          </label>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Dimensiones y tamaños</h3>
          <div className="grid grid-cols-2 gap-3">
            {numberField("Ancho etiqueta (mm)", fields, updateFields, "label_width_mm", 1)}
            {numberField("Alto etiqueta (mm)", fields, updateFields, "label_height_mm", 1)}
            {numberField("Tamaño QR (mm)", fields, updateFields, "qr_size_mm")}
            {numberField("Tamaño Subasta (pt)", fields, updateFields, "auction_font_pt")}
            {numberField("Tamaño Cliente (pt)", fields, updateFields, "customer_font_pt")}
            {numberField("Tamaño TikTok (pt)", fields, updateFields, "tiktok_font_pt")}
            {numberField("Tamaño Nº Pedido (pt)", fields, updateFields, "order_font_pt")}
            {numberField("Tamaño Precio (pt)", fields, updateFields, "price_font_pt")}
            {numberField("Tamaño Fecha (pt)", fields, updateFields, "date_font_pt")}
            {numberField("Tamaño base (pt)", fields, updateFields, "label_font_pt")}
            {numberField("Separación líneas (mm)", fields, updateFields, "line_spacing_mm")}
            {numberField("Separación título→datos (mm)", fields, updateFields, "title_data_gap_mm")}
            {numberField("Separación letras (pt)", fields, updateFields, "letter_spacing_pt")}
            {numberField("Ancho columna izq. (mm)", fields, updateFields, "label_col_width_mm")}
            {numberField("Separación columnas (mm)", fields, updateFields, "column_gap_mm")}
            {numberField("Márgenes internos (mm)", fields, updateFields, "padding_mm")}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={handleSave} disabled={saving || isNew} className={buttonClass}>
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
          <button
            onClick={handleSaveAsNew}
            disabled={saving}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Guardar como nueva
          </button>
          <button
            onClick={handleNewTemplate}
            disabled={saving}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Nueva plantilla
          </button>
          {templates.find((t) => t.id === selectedId)?.is_default === false && (
            <button
              onClick={handleSetDefault}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Marcar como predeterminada
            </button>
          )}
          {!isNew && templates.find((t) => t.id === selectedId)?.is_default === false && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              Eliminar plantilla
            </button>
          )}
        </div>
        <ErrorText message={error} />
      </div>

      <div className="w-full flex-none self-start lg:sticky lg:top-4 lg:w-80">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Vista previa</h3>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          A escala — refleja la proporción real de {fields.label_width_mm}×{fields.label_height_mm}mm.
        </p>
        <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <iframe
            srcDoc={previewHtml}
            title="Vista previa de la etiqueta"
            style={{ width: `${previewSize.widthMm}mm`, height: `${previewSize.heightMm}mm` }}
            className="border border-zinc-300 bg-white shadow-sm dark:border-zinc-700"
          />
        </div>
      </div>
    </div>
  );
}

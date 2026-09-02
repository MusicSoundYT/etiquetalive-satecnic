// Enlaza la identidad de "este ordenador" entre la extensión (que ve quién
// gana cada subasta, en shop.tiktok.com) y la pestaña de Pedidos (API) en
// Etiqueta Live (que decide qué imprimir aquí) — sin que nadie tenga que
// escribir ningún nombre a mano (eso fue justo lo que no funcionó antes con
// la vieja "estación").
//
// El mismo id se guarda en dos sitios que no se pueden leer entre sí
// (chrome.storage.local de la extensión, y el localStorage de la página):
// este content script hace de puente, copiando el id de la extensión al
// localStorage de la página la primera vez que la visita. Pedidos (API)
// (ver components/tiktok-print-watcher.tsx) usa ese valor si existe, en vez
// de generarse uno propio — así, con la extensión instalada, las dos partes
// acaban compartiendo el mismo id sin coordinación manual.
(() => {
  const STORAGE_KEY = "el_ext_device_id";
  const PAGE_KEY = "el_extension_device_id";

  chrome.storage.local.get([STORAGE_KEY], (r) => {
    let id = r[STORAGE_KEY];
    if (!id) {
      id = crypto.randomUUID();
      chrome.storage.local.set({ [STORAGE_KEY]: id });
    }
    try {
      localStorage.setItem(PAGE_KEY, id);
    } catch (_) {}
  });
})();

// Materias y material que agrega cada persona. Se guardan en el navegador (IndexedDB).
const DB = (() => {
  let conexion;

  const abrir = () => conexion || (conexion = new Promise((resolve, reject) => {
    const peticion = indexedDB.open("estudio", 1);
    peticion.onupgradeneeded = () => {
      peticion.result.createObjectStore("materias", { keyPath: "id" });
      peticion.result.createObjectStore("archivos", { keyPath: "id", autoIncrement: true })
        .createIndex("materia", "materia");
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  }));

  // Ejecuta una transacción y devuelve el resultado cuando termina.
  const operar = (stores, modo, accion) => abrir().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(stores, modo);
    const peticion = accion(tx);
    tx.oncomplete = () => resolve(peticion && peticion.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  }));

  return {
    listarMaterias: () =>
      operar("materias", "readonly", tx => tx.objectStore("materias").getAll()),

    crearMateria: materia =>
      operar("materias", "readwrite", tx => { tx.objectStore("materias").add(materia); }),

    borrarMateria: id =>
      operar(["materias", "archivos"], "readwrite", tx => {
        tx.objectStore("materias").delete(id);
        const cursor = tx.objectStore("archivos").index("materia").openCursor(id);
        cursor.onsuccess = () => {
          if (!cursor.result) return;
          cursor.result.delete();
          cursor.result.continue();
        };
      }),

    listarArchivos: materia =>
      operar("archivos", "readonly", tx => tx.objectStore("archivos").index("materia").getAll(materia)),

    agregarArchivos: (materia, archivos) =>
      operar("archivos", "readwrite", tx => {
        const store = tx.objectStore("archivos");
        [...archivos].forEach(a =>
          store.add({ materia, nombre: a.name, tipo: a.type, blob: a, fecha: Date.now() }));
      }),

    borrarArchivo: id =>
      operar("archivos", "readwrite", tx => { tx.objectStore("archivos").delete(id); })
  };
})();

# Tareas del proyecto. Uso: make <tarea>
PHP    := /opt/lampp/bin/php
PY     := procesador/.venv/bin/python
PRUEBAS_PY := tests/.venv/bin/python

.PHONY: migrar worker-una-vez lint pruebas-e2e pruebas-seguridad pruebas auditoria-deps

migrar:            ## Crea o actualiza las tablas (sql/*.sql)
	$(PHP) bin/migrar.php

worker-una-vez:    ## Procesa la cola de archivos y termina
	$(PY) procesador/worker.py --una-vez

lint:              ## Revisa la sintaxis de todo el PHP
	@for f in public/api/*.php src/*.php bin/*.php config/config.php; do $(PHP) -l $$f >/dev/null || exit 1; done; echo "PHP sin errores"

pruebas-e2e:       ## Pruebas de punta a punta (contra la BD local de pruebas)
	$(PRUEBAS_PY) -m pytest tests/e2e -q

pruebas-seguridad: ## Pruebas de los controles de seguridad
	$(PRUEBAS_PY) -m pytest tests/seguridad -q

pruebas: lint pruebas-seguridad pruebas-e2e

auditoria-deps:    ## Busca vulnerabilidades conocidas en las dependencias de Python
	$(PY) -m pip_audit -r procesador/requirements.txt

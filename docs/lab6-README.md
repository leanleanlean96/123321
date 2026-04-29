# Лабораторная работа №6: Kustomize и Helm

Репозиторий разделён на две независимые части:


| Каталог    | Что содержит                      |  |
| ----------------- | -------------------------------------------- | - |
| `k8s/`            | Deployment, Service, ConfigMap, Ingress, HPA |  |
| `infra/postgres/` | StatefulSet, Headless Service, PVC           |  |

В `k8s/` **нет ни одного манифеста БД**. `DATABASE_URL` задаётся через overlay/values и берётся из контракта инфраструктуры.

---

## Инфраструктура PostgreSQL

### Контракт для приложения


| Параметр | Dev                                                                  | Prod                                              |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| Host             | `postgres-0.postgres`                                                | `postgres-0.postgres.todo-demo.svc.cluster.local` |
| Port             | `5432`                                                               | `5432`                                            |
| Database         | `todo`                                                               | `todo`                                            |
| User             | `todo`                                                               | `todo`                                            |
| DATABASE\_URL    | `postgres://todo:todo@postgres-0.postgres:5432/todo?sslmode=disable` | FQDN + CI-секрет                            |

### Структура

```
infra/postgres/
  README.md                        # Контракт и порядок деплоя
  k8s/
    kustomization/
      base/
        postgres-statefulset.yaml  # StatefulSet + volumeClaimTemplates (1Gi)
        postgres-service.yaml      # Headless Service (clusterIP: None)
      overlays/dev/                # namespace todo-demo, 1Gi, ресурсы dev
      overlays/prod/               # namespace todo-demo, 10Gi, ресурсы prod
    helm/postgres-infra/
      Chart.yaml
      values.yaml
      values-dev.yaml              # storage: 1Gi
      values-prod.yaml             # storage: 10Gi, ресурсы prod
      templates/
        statefulset.yaml
        service.yaml
        secret.yaml
```

### Деплой через Kustomize

```bash
# Просмотр (Namespace, StatefulSet, Service, Secret)
kubectl kustomize infra/postgres/k8s/kustomization/overlays/dev | grep "kind:"

# Применить dev
kubectl apply -k infra/postgres/k8s/kustomization/overlays/dev
kubectl get pods,pvc -n todo-demo -l app=postgres
# postgres-0 Running, PVC data-postgres-0 Bound 1Gi
```

### Деплой через Helm

```bash
# Просмотр шаблонов
helm template todo-db ./infra/postgres/k8s/helm/postgres-infra \
  --namespace todo-demo \
  -f ./infra/postgres/k8s/helm/postgres-infra/values-dev.yaml | grep "kind:"

# Установить
helm upgrade --install todo-db ./infra/postgres/k8s/helm/postgres-infra \
  --namespace todo-demo --create-namespace \
  -f ./infra/postgres/k8s/helm/postgres-infra/values-dev.yaml

kubectl get pods,pvc -n todo-demo -l app=postgres
```

---

## Приложение через Kustomize

### Структура

```
k8s/kustomization/
  base/
    configmap.yaml           # PORT_BACKEND, PORT_FRONTEND, HOST, API_URL
    backend-deployment.yaml  # envFrom: configmap + secret
    frontend-deployment.yaml
    backend-service.yaml
    frontend-service.yaml
    ingress.yaml
    hpa-backend.yaml
  overlays/
    dev/
      namespace.yaml         # Namespace todo-demo
      secret.yaml            # DATABASE_URL → postgres-0.postgres (короткий хост)
      patch-replicas.yaml    # replicas: 1
      patch-configmap.yaml   # API_URL: http://localhost:8080
    prod/
      namespace.yaml         # Namespace todo-prod
      secret.yaml            # DATABASE_URL → FQDN (cross-namespace)
      patch-resources.yaml   # replicas: 3, requests/limits увеличены
```

### Деплой

```bash
kubectl kustomize k8s/kustomization/overlays/dev | grep "kind:" | sort -u
# ConfigMap, HPA, Ingress, Deployment x2, Namespace, Secret, Service x2

# Применить
kubectl apply -k k8s/kustomization/overlays/dev

# Health-checks работают
kubectl port-forward svc/todo-backend 8080:8080 -n todo-demo &
curl http://localhost:8080/health   # {"status":"ok"}
curl http://localhost:8080/ready    # {"status":"ready"}
kill %1
```

---

## Приложение через Helm

### Структура

```
k8s/helm/todo-app/
  Chart.yaml
  values.yaml          # дефолты: replicas, resources, ingress, hpa, otel
  values-dev.yaml      # replicas: 1, dev ресурсы
  values-prod.yaml     # replicas: 3, prod ресурсы, FQDN для БД
  templates/
    configmap.yaml
    backend-deployment.yaml
    frontend-deployment.yaml
    backend-service.yaml
    frontend-service.yaml
    secret.yaml          # DATABASE_URL собирается из values.database.*
    ingress.yaml         # если ingress.enabled=true
    hpa.yaml             # если hpa.enabled=true
```

### Деплой

```bash
# Удалить Kustomize-деплой
kubectl delete -k k8s/kustomization/overlays/dev --ignore-not-found

# Просмотр шаблонов
helm template todo-app ./k8s/helm/todo-app \
  --namespace todo-demo \
  -f ./k8s/helm/todo-app/values-dev.yaml | grep "kind:" | sort -u

# Установить
helm upgrade --install todo-app ./k8s/helm/todo-app \
  --namespace todo-demo --create-namespace \
  -f ./k8s/helm/todo-app/values-dev.yaml

helm list -n todo-demo
# NAME: todo-app
# NAMESPACE: todo-demo
# STATUS: deployed
# REVISION: 1
```

### Rolling update и откат

```bash
# Обновить (увеличить реплики)
helm upgrade todo-app ./k8s/helm/todo-app \
  --namespace todo-demo \
  -f ./k8s/helm/todo-app/values-dev.yaml \
  --set backend.replicas=2

kubectl get pods -n todo-demo -l component=backend
# 2 пода backend Running

# Откат к версии 1
helm rollback todo-app 1 -n todo-demo

# Удалить
helm uninstall todo-app -n todo-demo
```

---

## Задание 3: Порядок деплоя и проверка health-checks

```bash
# сначала деплоится инфраструктура, потом приложение
kubectl apply -k infra/postgres/k8s/kustomization/overlays/dev
kubectl wait --namespace todo-demo --for=condition=ready pod \
  --selector=app=postgres --timeout=120s

kubectl apply -k k8s/kustomization/overlays/dev
kubectl wait --namespace todo-demo --for=condition=ready pod \
  --selector=app=todo-app,component=backend --timeout=120s

# Health-checks
kubectl port-forward svc/todo-backend 8080:8080 -n todo-demo &
curl http://localhost:8080/health   # {"status":"ok","service":"todo-backend"}
curl http://localhost:8080/ready    # {"status":"ready"}
kill %1

# Frontend доступен
curl -s http://todo.local:30080/ | grep -i "todo"
```

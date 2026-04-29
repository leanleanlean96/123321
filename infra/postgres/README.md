# infra/postgres — Инфраструктура базы данных

Отдельный «репозиторий инфраструктуры» для PostgreSQL.
Содержит **только** StatefulSet, Headless Service, PVC и Secret с учётными данными.
Манифесты приложения (frontend/backend) — в корне репозитория (`k8s/`).

## Почему отдельно

- Разные команды и релизные циклы (платформа vs приложение)
- Секреты и бэкапы БД не смешиваются с Dockerfile приложения
- Приложение подключается к БД по контракту, описанному ниже

---

## Контракт для приложения (DATABASE_URL)

| Параметр | Dev (namespace: `todo-demo`) | Prod (cross-namespace) |
|----------|------------------------------|------------------------|
| Host     | `postgres-0.postgres`        | `postgres-0.postgres.todo-demo.svc.cluster.local` |
| Port     | `5432`                       | `5432` |
| Database | `todo`                       | `todo` |
| User     | `todo`                       | `todo` |
| Password | `todo` (dev-заглушка)         | задаётся через CI / Sealed Secrets |

**Dev DATABASE_URL:**
```
postgres://todo:todo@postgres-0.postgres:5432/todo?sslmode=disable
```

**Prod DATABASE_URL (cross-namespace FQDN):**
```
postgres://todo:REPLACE@postgres-0.postgres.todo-demo.svc.cluster.local:5432/todo?sslmode=disable
```

---

## Деплой

### Kustomize

```bash
# Dev
kubectl apply -k k8s/kustomization/overlays/dev
kubectl get pods,pvc -n todo-demo -l app=postgres

# Prod
kubectl apply -k k8s/kustomization/overlays/prod
```

### Helm

```bash
helm upgrade --install todo-db ./k8s/helm/postgres-infra \
  --namespace todo-demo --create-namespace \
  -f ./k8s/helm/postgres-infra/values-dev.yaml

# Prod (пароль через --set)
helm upgrade --install todo-db ./k8s/helm/postgres-infra \
  --namespace todo-demo \
  -f ./k8s/helm/postgres-infra/values-prod.yaml \
  --set auth.password=REAL_PROD_PASSWORD
```

### Проверка

```bash
kubectl get pods,pvc -n todo-demo -l app=postgres
# Pod postgres-0 должен быть Running, PVC Bound.

kubectl exec -it postgres-0 -n todo-demo -- psql -U todo -d todo -c '\dt'
```

## Структура

```
k8s/
  kustomization/
    base/
      postgres-statefulset.yaml   — StatefulSet с volumeClaimTemplates
      postgres-service.yaml       — Headless Service (clusterIP: None)
      kustomization.yaml
    overlays/
      dev/  — namespace: todo-demo, 1 Gi, лёгкие ресурсы, dev-пароли
      prod/ — namespace: todo-demo, 10 Gi, продовые ресурсы, пароль-заглушка
  helm/postgres-infra/
    Chart.yaml
    values.yaml          — дефолты
    values-dev.yaml
    values-prod.yaml
    templates/
      statefulset.yaml
      service.yaml
      secret.yaml
```

## Важно

- PVC **не удаляются** при `kubectl delete -k` или `helm uninstall` — это защита данных.
  Для полного удаления с данными: `kubectl delete pvc -n todo-demo -l app=postgres`
- Dev-пароли (`todo`/`todo`) не должны попадать в продакшн.
  В проде используйте Sealed Secrets, External Secrets Operator или CI-переменные.

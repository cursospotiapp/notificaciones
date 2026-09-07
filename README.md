<div align="center">

# **Notificaciones**

### *Microservicio genérico de notificaciones multicanal dirigido por eventos*

[![Node.js](https://img.shields.io/badge/Node.js-21-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-topic_+_DLQ-FF6600?style=flat-square&logo=rabbitmq&logoColor=white)](https://www.rabbitmq.com)
[![Tests](https://img.shields.io/badge/Jest-tested-success?style=flat-square&logo=jest&logoColor=white)](#verificación-y-ciclo-de-desarrollo)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](#puesta-en-marcha)
[![License](https://img.shields.io/badge/License-ISC-blue?style=flat-square)](#configuración)

</div>

---

## Descripción

Este servicio materializa el **patrón consumidor-despachador** para notificaciones: cualquier servicio del ecosistema publica un mensaje JSON en RabbitMQ y se olvida; este microservicio lo valida, decide **cómo** debe salir (correo, webhook, y los canales que se añadan) y lo entrega con garantías — reintentos con espera, cola de fallidos e idempotencia.

El productor nunca espera respuesta y nunca conoce el canal de salida. El contrato entre ambos es un único sobre JSON, documentado en [Contrato de mensajes](#contrato-de-mensajes).

> **Principio rector.** *Notificar es un efecto, no una llamada.* El servicio que origina el evento no debería saber si el usuario recibe un correo, un webhook o nada todavía: esa decisión pertenece a la infraestructura de notificaciones.

---

## Arquitectura

<div align="center">

![Diagrama de arquitectura](docs/arquitectura.svg)

</div>

Cada pieza es **ortogonal**: el productor solo conoce el sobre JSON; el consumidor solo conoce la topología de colas; el despachador solo conoce los canales; y cada canal solo conoce su protocolo de salida. Añadir un canal nuevo no toca ni productores ni colas (ver [Canales](#canales)).

---

## Contrato de mensajes

### Sobre de notificación

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "channel": "email",
  "template": "verifyEmail",
  "to": "usuario@ejemplo.com",
  "subject": "Verifica tu cuenta",
  "data": { "username": "Ana", "verifyLink": "https://miapp.com/verificar?token=abc" },
  "maxRetries": 5
}
```

| Campo | Obligatorio | Semántica |
|-------|:-----------:|-----------|
| `id` | Sí | Clave de idempotencia (UUID v4 generado por el productor) |
| `channel` | Sí | `email` o `webhook` |
| `template` | Sí | Nombre de la plantilla (`src/emails/<template>/`) o tipo de evento |
| `to` | Sí | Dirección de correo (email) o URL http(s) (webhook) |
| `subject` | No | Asunto del correo o título del evento |
| `data` | No | Datos del caso de uso; en email quedan disponibles en la plantilla EJS |
| `maxRetries` | No | Reintentos para este mensaje; si se omite manda `MAX_RETRIES` |

Toda desviación del contrato — campos ausentes, tipos incorrectos, canal desconocido — se **rechaza en la frontera** con un error no reintentable que deriva el mensaje a la cola de fallidos, sin que alcance ningún canal.

### Topología de colas

| Exchange | Routing key | Cola | Propósito |
|----------|-------------|------|-----------|
| `notifications` (topic) | `notification.email` | `notifications.email` | Entrada del canal email |
| `notifications` (topic) | `notification.webhook` | `notifications.webhook` | Entrada del canal webhook |
| — | — | `notifications.retry.<canal>` | Espera con TTL; al caducar RabbitMQ devuelve el mensaje al exchange |
| `notifications.dlx` (fanout) | — | `notifications.dlq` | Fallidos: contrato inválido o reintentos agotados, con cabeceras de diagnóstico |

---

## Canales

| Canal | Estado | Destino | Implementación |
|-------|:------:|---------|----------------|
| `email` | ✅ Operativo | SMTP configurable (`SMTP_HOST`, `SMTP_PORT`) | Plantillas EJS en `src/emails/<plantilla>/` (`html.ejs` + `subject.ejs`), con `appName`, `appLink`, `appIcon` y todo `data` disponible como variables |
| `webhook` | ✅ Operativo | URL http(s) del mensaje | `POST` JSON `{ id, template, subject, data }` con cabecera `x-notification-id` y timeout (`WEBHOOK_TIMEOUT_MS`) |
| `sms`, `push`, `ftp`... | 🧩 Punto de extensión | — | Tres pasos, sin tocar productores ni colas |

<details>
<summary><strong>Cómo añadir un canal nuevo</strong></summary>

1. Crear `src/channels/<canal>.channel.ts` con una función `send<Canal>Channel(notification)`.
2. Añadir el valor al tipo `NotificationChannel` en `src/contract.ts`.
3. Añadir un `case` en `src/channels/dispatcher.ts` y su entrada en `src/queues/topology.ts`.

</details>

Las plantillas incluidas (`verifyEmail`, `forgotPassword`, `otpEmail`, `offer`, `orderPlaced`, `orderReceipt`, `orderExtension`, `orderExtensionApproval`, `orderDelivered`, `resetPasswordSuccess`) son un **juego de ejemplo**; la marca que muestran se toma de `APP_NAME`, sin nada codificado en el código.

---

## Fiabilidad

Ninguna notificación se pierde en silencio:

- **Reintentos con espera.** Ante un fallo transitorio (SMTP caído, webhook con 5xx o timeout), el mensaje se publica en la cola de reintentos del canal con un contador de intentos; al caducar el TTL (`RETRY_DELAY_MS`) RabbitMQ lo devuelve solo al flujo principal. Sin hilos ni temporizadores en el código.
- **Cola de fallidos (DLQ).** Los mensajes con contrato inválido y los que agotan sus reintentos terminan en `notifications.dlq` con cabeceras de diagnóstico (`attempts`, `error`, `originalRoutingKey`), listos para reinyectar o auditar.
- **Idempotencia.** RabbitMQ entrega "al menos una vez": cada `id` procesado se recuerda durante `IDEMPOTENCY_TTL_MS` y los duplicados se confirman sin reenviar. La implementación en memoria vale para una réplica; para varias, sustituir `src/idempotency.ts` por Redis manteniendo su interfaz.
- **Confirmado explícito.** Nada se confirma (`ack`) hasta que el canal responde o el mensaje queda aparcado en reintentos/fallidos. `PREFETCH_COUNT` limita los mensajes en vuelo por consumidor.
- **Apagado limpio.** `SIGINT`/`SIGTERM` cierran canal, conexión y servidor HTTP en orden.

---

## Superficie HTTP

El servicio se gobierna por colas; HTTP existe solo para operación:

| Método | Endpoint | Propósito |
|:------:|----------|-----------|
| `GET` | `/salud` | Liveness: el proceso responde |
| `GET` | `/listo` | Readiness: devuelve `200` con el estado de RabbitMQ (y Elasticsearch si está activo), o `503` |

---

## Puesta en marcha

### Requisitos

- Node.js 21
- Una instancia de RabbitMQ accesible (local con Docker, ver abajo)
- Credenciales SMTP para el canal email (en desarrollo vale una cuenta de pruebas de `https://ethereal.email`)

### Arranque local

```bash
git clone https://github.com/cursospotiapp/notificaciones.git
cd notificaciones
docker compose up -d   # RabbitMQ (http://localhost:15672) + Elasticsearch opcional
cp .env.example .env   # ajustar SENDER_EMAIL / SENDER_EMAIL_PASSWORD
npm install
npm run dev            # desarrollo con recarga en caliente
```

Publicar una notificación de prueba (con RabbitMQ en marcha):

```bash
# ejemplo con amqplib o la consola de management (http://localhost:15672):
# exchange `notifications`, routing key `notification.email`, cuerpo:
{"id":"<uuid>","channel":"email","template":"verifyEmail","to":"destino@ejemplo.com","data":{"username":"Ana"}}
```

### Imagen Docker

```bash
docker build -t <tu-usuario-dockerhub>/notificaciones .
docker tag <tu-usuario-dockerhub>/notificaciones <tu-usuario-dockerhub>/notificaciones:stable
docker push <tu-usuario-dockerhub>/notificaciones:stable
```

El `Jenkinsfile` incluye un pipeline de referencia (lint → formato → tests → build/push → despliegue rodante en Kubernetes).

---

## Configuración

Toda la configuración se inyecta por variables de entorno (ver `.env.example`). **No existen credenciales en el código.**

| Variable | Semántica | Valor por defecto |
|----------|-----------|-------------------|
| `PORT` | Puerto del servidor HTTP | `4001` |
| `LOG_LEVEL` | Umbral del registrador (`debug` / `info` / `error`) | `debug` |
| `APP_NAME` / `APP_URL` / `APP_ICON` | Marca disponible en las plantillas como `appName`, `appLink`, `appIcon` | `Notificaciones` / `http://localhost:3000` / … |
| `RABBITMQ_URL` | Conexión AMQP | `amqp://guest:guest@localhost:5672` |
| `SMTP_HOST` / `SMTP_PORT` | Servidor de salida del canal email | `smtp.ethereal.email` / `587` |
| `SENDER_EMAIL` / `SENDER_EMAIL_PASSWORD` | Credenciales SMTP y remitente | — |
| `MAX_RETRIES` | Reintentos por defecto | `3` |
| `RETRY_DELAY_MS` | Espera entre reintentos (TTL de la cola de reintentos) | `30000` |
| `PREFETCH_COUNT` | Mensajes en vuelo por consumidor | `10` |
| `WEBHOOK_TIMEOUT_MS` | Timeout de entrega webhook | `10000` |
| `IDEMPOTENCY_TTL_MS` | Memoria de ids procesados | `86400000` (24 h) |
| `ELASTICSEARCH_ENABLED` / `ELASTICSEARCH_URL` | Centralizar logs (`1` = activo) | `0` / `http://localhost:9200` |
| `ENABLE_APM` | Trazas APM elásticas (`1` = activo) | `0` |

---

## Verificación y ciclo de desarrollo

| Comando | Función |
|---------|---------|
| `npm run dev` | Desarrollo con recarga automática (`nodemon`) |
| `npm start` | Producción (`pm2` sobre `build/`) |
| `npm test` | Suite de pruebas con cobertura (`jest`) |
| `npm run lint:check` / `lint:fix` | Análisis estático (`eslint`) |
| `npm run prettier:check` / `prettier:fix` | Formateo determinista |
| `npm run build` | Compilación (`tsc` + alias + copia de plantillas a `build/`) |

<details>
<summary><strong>Stack técnico</strong></summary>

| Capa | Tecnología |
|------|------------|
| Runtime | Node.js 21 / Express 4 / TypeScript 5 |
| Mensajería | `amqplib` contra RabbitMQ (exchange topic + DLX + colas con TTL) |
| Canal email | `nodemailer` + `email-templates` (EJS) |
| Canal webhook | `fetch` nativo con `AbortController` |
| Observabilidad | `winston` propio (consola legible en dev, JSON en producción), `/salud`, `/listo`, Elasticsearch y APM opcionales |
| Calidad | `jest` + `ts-jest` (24 pruebas), `eslint`, `prettier` |
| Despliegue | `Dockerfile` + `Dockerfile.dev`, `docker-compose.yml`, `Jenkinsfile`, `pm2` |

</details>

---

## Observabilidad

Toda operación deja traza en un **registrador estructurado** propio (`src/logger.ts`): legible en desarrollo y JSON de una línea en producción, listo para Elasticsearch, Loki o CloudWatch sin agentes intermedios. Los fallos de envío registran el `id` de la notificación y el motivo; los duplicados y reintentos quedan marcados como tales. Elasticsearch es deliberadamente opcional: el servicio funciona igual sin él.

---

## Estructura del proyecto

```text
src/
├── app.ts                 # arranque + apagado limpio (SIGINT/SIGTERM)
├── server.ts              # HTTP, colas y chequeo de readiness
├── routes.ts              # GET /salud, GET /listo
├── config.ts              # toda la configuración, desde entorno
├── contract.ts            # el contrato: INotification + validación en frontera
├── logger.ts              # registrador estructurado propio
├── idempotency.ts         # deduplicación por id
├── elasticsearch.ts       # chequeo opcional (solo logs)
├── channels/
│   ├── dispatcher.ts      # decide CÓMO sale cada notificación
│   ├── email.channel.ts   # SMTP + plantillas EJS
│   └── webhook.channel.ts # POST JSON con timeout
├── queues/
│   ├── topology.ts        # exchanges, colas, routing keys, reintentos, DLQ
│   ├── connection.ts      # conexión AMQP + prefetch
│   └── consumer.ts        # validación → idempotencia → despacho → ack
└── emails/                # juego de plantillas EJS de ejemplo
```

---

<div align="center">

*Diseñado con un principio en mente: notificar es un efecto, no una llamada.*

</div>

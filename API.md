# Not Royaltor360 API Documentation

Base URL: `/api/v1`
Authentication: Bearer token (JWT) via `Authorization: Bearer <token>` header.

---

## Authentication

### Register User
**POST** `/api/v1/auth/register`

Creates a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "full_name": "John Doe",
  "role": "lote_owner"  // "lote_owner" | "advisor" | "super_admin"
}
```

**Response `201`:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "John Doe",
  "role": "lote_owner",
  "is_active": true
}
```

**Errors:**
- `400` - Email already registered

---

### Login
**POST** `/api/v1/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response `200`:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

**Errors:**
- `401` - Invalid credentials
- `400` - User inactive

---

### Get Current User
**GET** `/api/v1/auth/me`

Requires authentication.

**Response `200`:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "John Doe",
  "role": "lote_owner",
  "is_active": true
}
```

**Errors:**
- `401` - Unauthorized

---

## Loteos

### List Loteos
**GET** `/api/v1/loteos`

Lists loteos (land developments) with pagination.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `include_lotes` | boolean | false | Include lots in each loteo |
| `limit` | integer | 50 | Items per page (max 100) |
| `offset` | integer | 0 | Pagination offset |

**Response `200`:**
```json
{
  "items": [
    {
      "id": "uuid",
      "lote_owner_id": "uuid",
      "name": "Loteo San Juan",
      "slug": "loteo-san-juan",
      "image_url": "https://...",
      "blueprint_url": "https://...",
      "text_annotations": null,
      "lotes": [
        {
          "id": "uuid",
          "name": "Lote 1",
          "area_m2": 500.00,
          "price": 100000.00
        }
      ]
    }
  ],
  "total": 10,
  "limit": 50,
  "offset": 0
}
```

---

### Create Loteo
**POST** `/api/v1/loteos`

Requires `lote_owner` role.

**Request Body:**
```json
{
  "name": "Loteo San Juan",
  "slug": "loteo-san-juan",  // optional, auto-generated
  "image_url": "https://...",   // optional
  "blueprint_url": "https://...", // optional
  "text_annotations": []  // optional
}
```

**Response `201`:**
```json
{
  "id": "uuid",
  "lote_owner_id": "uuid",
  "name": "Loteo San Juan",
  "slug": "loteo-san-juan",
  "image_url": "https://...",
  "blueprint_url": "https://...",
  "text_annotations": null
}
```

**Errors:**
- `403` - Requires lote_owner role

---

### Get Loteo
**GET** `/api/v1/loteos/{loteo_id}`

**Response `200`:** Same as create response.

**Errors:**
- `403` - No access to this loteo
- `404` - Loteo not found

---

### Update Loteo
**PATCH** `/api/v1/loteos/{loteo_id}`

**Request Body:**
```json
{
  "name": "New Name",           // optional
  "slug": "new-slug",           // optional
  "image_url": "https://...",   // optional
  "blueprint_url": "https://...", // optional
  "text_annotations": []        // optional
}
```

**Response `200`:** Updated loteo object.

**Errors:**
- `404` - Loteo not found

---

### Delete Loteo
**DELETE** `/api/v1/loteos/{loteo_id}`

Requires `lote_owner` role. Only the owner can delete.

**Response `204`:** No content.

**Errors:**
- `404` - Loteo not found or not owner

---

### Get Visor Data (360°)
**GET** `/api/v1/loteos/{loteo_id}/visor_data`

Public endpoint. Returns 360° viewer configuration with lot annotations.

**Response `200`:**
```json
{
  "panoramaUrl": "https://...",
  "blueprintUrl": "https://...",
  "annotations": [
    {
      "uuid": "lote-uuid",
      "type": "polygon",
      "panorama_coordinates": [[x1, y1], [x2, y2], ...],
      "blueprint_coordinates": [[x1, y1], [x2, y2], ...],
      "tooltip": "Lote 1",
      "price": 100000.00,
      "area_m2": 500.00,
      "status": "available",
      "svgStyle": {
        "fill": "rgba(0,100,255,0.3)",
        "stroke": "#06c",
        "strokeWidth": "2"
      }
    }
  ]
}
```

**Errors:**
- `404` - Loteo not found

---

### Get Loteo Clicks
**GET** `/api/v1/loteos/{loteo_id}/clicks`

Returns click counts per lot in a loteo.

**Response `200`:**
```json
[
  { "lote_uuid": "uuid", "name": "Lote 1", "clicks": 42 },
  { "lote_uuid": "uuid", "name": "Lote 2", "clicks": 15 }
]
```

**Errors:**
- `403` - No access to loteos
- `404` - Loteo not found

---

## Lots

### List Lots
**GET** `/api/v1/lots`

Lists lots with pagination and filters.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status: `available`, `sold`, `reserved` |
| `loteo_id` | UUID | Filter by loteo |
| `name` | string | Search by name (partial, case-insensitive) |
| `limit` | integer | Items per page (max 100, default 50) |
| `offset` | integer | Pagination offset |

**Response `200`:**
```json
{
  "items": [
    {
      "id": "uuid",
      "lote_owner_id": "uuid",
      "name": "Lote 1",
      "slug": "lote-1",
      "status": "available",
      "price": 100000.00,
      "area_m2": 500.00,
      "loteo_id": "uuid",
      "loteo_name": "Loteo San Juan",
      "coordinates_360": [[x1, y1], ...],
      "blueprint_coordinates": [[x1, y1], ...],
      "sold_by_advisor_id": null,
      "sold_at": null,
      "prospect_names": ["Juan Perez"]
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

---

### Create Lot
**POST** `/api/v1/lots`

Requires `lote_owner` role.

**Request Body:**
```json
{
  "name": "Lote 1",               // optional
  "slug": "lote-1",               // optional
  "status": "available",          // default: available
  "price": 100000.00,
  "area_m2": 500.00,             // optional
  "loteo_id": "uuid",            // optional
  "coordinates_360": [[x1,y1],...], // optional
  "blueprint_coordinates": [[x1,y1],...], // optional
  "sold_by_advisor_id": "uuid"   // optional
}
```

**Response `201`:** Lot object.

**Errors:**
- `403` - Requires lote_owner role
- `400` - Loteo doesn't belong to owner

---

### Get Lot
**GET** `/api/v1/lots/{lote_id}`

**Response `200`:** Lot object.

**Errors:**
- `403` - No access to lots
- `404` - Lot not found

---

### Update Lot
**PATCH** `/api/v1/lots/{lote_id}`

Requires `lote_owner` role. When status changes to `sold`, `sold_at` is automatically set.

**Request Body:**
```json
{
  "name": "New Name",             // optional
  "status": "sold",               // optional
  "price": 120000.00,            // optional
  "area_m2": 550.00,             // optional
  "loteo_id": "uuid",            // optional
  "coordinates_360": [[x1,y1],...], // optional
  "blueprint_coordinates": [[x1,y1],...], // optional
  "sold_by_advisor_id": "uuid"   // optional
}
```

**Response `200`:** Updated lot object.

**Errors:**
- `404` - Lot not found or not owner

---

### Delete Lot
**DELETE** `/api/v1/lots/{lote_id}`

Requires `lote_owner` role.

**Response `204`:** No content.

**Errors:**
- `404` - Lot not found or not owner

---

### Update Lot Coordinates (360)
**POST** `/api/v1/lots/update-coordinates`

Updates 360° polygon coordinates for a lot. **No authentication (TODO).**

**Request Body:**
```json
{
  "uuid": "lote-uuid",
  "polygonPoints": [[500, 300], [600, 300], [600, 400], [500, 400]]
}
```

**Response `200`:** Updated lot object.

**Errors:**
- `404` - Lot not found

---

### Update Lot Blueprint Coordinates
**POST** `/api/v1/lots/update-blueprint-coordinates`

Updates blueprint polygon coordinates for a lot. **No authentication (TODO).**

**Request Body:**
```json
{
  "uuid": "lote-uuid",
  "polygonPoints": [[500, 300], [600, 300], [600, 400], [500, 400]]
}
```

**Response `200`:** Updated lot object.

**Errors:**
- `404` - Lot not found

---

## Prospects

### List Prospects
**GET** `/api/v1/prospects`

Lists prospects with pagination and filters.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `lote_id` | UUID | Filter by lot |
| `loteo_id` | UUID | Filter by loteo |
| `category` | string | Filter by category |
| `origin` | string | Filter by origin |
| `asesor_id` | UUID | Filter by advisor |
| `without_advisor` | boolean | True = only prospects without advisor |
| `limit` | integer | Items per page (max 100, default 50) |
| `offset` | integer | Pagination offset |

**Category values:** `primer_contacto`, `seguimiento`, `negociacion`, `vendido`

**Origin values:** `web_platform`, `visor_whatsapp`, `visor_direct`, `visor_google`, `visor_tiktok`, `visor_facebook`, `visor_youtube`

**Response `200`:**
```json
{
  "items": [
    {
      "id": "uuid",
      "lote_id": "uuid",
      "advisor_id": "uuid",
      "name": "Juan Perez",
      "email": "juan@example.com",
      "phone": "+5491112345678",
      "category": "primer_contacto",
      "origin": "visor_whatsapp",
      "last_contact": "2024-01-15T10:30:00Z",
      "observation_notes": "Interested, following up next week"
    }
  ],
  "total": 25,
  "limit": 50,
  "offset": 0
}
```

---

### Create Prospect
**POST** `/api/v1/prospects`

Requires `lote_owner` role.

**Request Body:**
```json
{
  "lote_id": "uuid",
  "advisor_id": "uuid",       // optional
  "name": "Juan Perez",
  "email": "juan@example.com", // required if no phone
  "phone": "+5491112345678",   // required if no email
  "category": "primer_contacto",
  "origin": "web_platform",    // optional: see ProspectOrigin enum
  "last_contact": "2024-01-15T10:30:00Z",  // optional
  "observation_notes": "Interested, following up next week"  // optional (max 500 chars)
}
```

**Response `201`:** Prospect object.

**Errors:**
- `404` - Lot not found
- `403` - Requires lote_owner role

---

### Get Prospect
**GET** `/api/v1/prospects/{prospect_id}`

**Response `200`:** Prospect object.

**Errors:**
- `403` - No access
- `404` - Prospect not found

---

### Update Prospect
**PATCH** `/api/v1/prospects/{prospect_id}`

Requires `lote_owner` role.

**Request Body:**
```json
{
  "advisor_id": "uuid",       // optional
  "name": "New Name",         // optional
  "email": "new@example.com", // optional
  "phone": "+549...",         // optional
  "category": "seguimiento",  // optional
  "origin": "visor_direct",   // optional: see ProspectOrigin enum
  "last_contact": "2024-01-20T10:30:00Z",  // optional
  "observation_notes": "Updated notes"  // optional (max 500 chars)
}
```

**Response `200`:** Updated prospect object.

**Errors:**
- `404` - Prospect not found or lot not owned

---

### Update Last Contact
**PATCH** `/api/v1/prospects/{prospect_id}/last-contact`

Requires `lote_owner` role. Registers the date of last contact and optionally updates observation notes.

**Request Body:**
```json
{
  "last_contact": "2024-01-15T10:30:00Z",  // optional, defaults to now
  "observation_notes": "Visited the site, interested in financing options"  // optional (max 500 chars)
}
```

**Response `200`:** Updated prospect object (includes observation_notes).

---

### Delete Prospect
**DELETE** `/api/v1/prospects/{prospect_id}`

Requires `lote_owner` role.

**Response `204`:** No content.

**Errors:**
- `404` - Prospect not found or lot not owned

---

## Advisors

### List Advisors
**GET** `/api/v1/advisors`

Requires `lote_owner` or `super_admin` role.

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "full_name": "Maria Garcia",
    "email": "maria@example.com",
    "phone": "+5491112345678"
  }
]
```

**Errors:**
- `403` - Insufficient permissions

---

## Public Endpoints

No authentication required.

### Register Lot Click
**POST** `/api/v1/public/lots/{lote_id}/click`

Registers a click on a lot in the 360° viewer.

**Response `201`:**
```json
{
  "ok": true,
  "id": "click-uuid"
}
```

**Errors:**
- `404` - Lot not found or sold

---

### Submit Pre-Qualification
**POST** `/api/v1/public/pre-qualification`

Public form submission. Creates a prospect in `primer_contacto` category.

**Request Body:**
```json
{
  "lote_id": "uuid",
  "name": "Juan Perez",
  "email": "juan@example.com",  // required if no phone
  "phone": "+5491112345678",    // required if no email
  "budget": 150000.00,
  "payment_method": "contado"   // "contado" | "credito"
}
```

**Response `201`:**
```json
{
  "id": "prospect-uuid",
  "message": "Solicitud recibida. Un asesor se contactará."
}
```

**Errors:**
- `404` - Lot not found

---

## Reports

### General Report
**GET** `/api/v1/reports/general`

General report with lots by status, prospects by category, and top lots.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `date_from` | datetime | Start of period (prospect created) |
| `date_to` | datetime | End of period |
| `last_days` | integer | Shortcut: 1, 5, 10, 20, 30, or 60 days |

**Response `200`:**
```json
{
  "lotes_por_estado": {
    "available": 60,
    "sold": 30,
    "reserved": 10
  },
  "prospectos_por_categoria": {
    "primer_contacto": 20,
    "seguimiento": 15,
    "negociacion": 10
  },
  "lotes_con_mas_interes": [
    {
      "lote_id": "uuid",
      "lote_name": "Lote 1",
      "loteo_id": "uuid",
      "cantidad_prospectos": 5
    }
  ],
  "prospectos_en_periodo": 12
}
```

**Errors:**
- `422` - Invalid `last_days` value

---

### Finances Report
**GET** `/api/v1/reports/finances`

Financial report with values by status and optionally by period.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `date_from` | datetime | Start of period (sales by sold_at) |
| `date_to` | datetime | End of period |
| `last_days` | integer | Shortcut: 1, 5, 10, 20, 30, or 60 days |

**Response `200`:**
```json
{
  "valor_inventario": 6000000.00,
  "valor_vendido": 3000000.00,
  "valor_reservado": 1000000.00,
  "desglose_por_estado": [
    { "status": "available", "cantidad": 60, "valor_total": 6000000.00 },
    { "status": "sold", "cantidad": 30, "valor_total": 3000000.00 },
    { "status": "reserved", "cantidad": 10, "valor_total": 1000000.00 }
  ],
  "ventas_en_periodo": 500000.00,
  "cantidad_vendidos_en_periodo": 5
}
```

**Errors:**
- `422` - Invalid `last_days` value

---

## Contracts

### List Contracts
**GET** `/api/v1/contracts`

Lists sale contracts with filters. Requires `advisor` or `super_admin` role.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `active_only` | boolean | True = only active, False = only cancelled |
| `prospect_id` | UUID | Filter by prospect |
| `lote_owner_id` | UUID | Filter by lot owner |

**Response `200`:**
```json
{
  "contracts": [
    {
      "id": "uuid",
      "lote_id": "uuid",
      "prospect_id": "uuid",
      "sold_by_advisor_id": "uuid",
      "contract_date": "2024-01-15T10:00:00Z",
      "total_amount": 100000.00,
      "unit_type": "pesos",
      "status": "active",
      "installments_count": 24,
      "interest_base_amount": 80000.00,
      "interest_rate_percent": 2.5,
      "interest_periodicity": "mensual",
      "amortization_type": "frances",
      "paid_count": 6,
      "pending_count": 18,
      "total_pending_amount": 75000.00,
      "total_pending_ars_approx": 75000.00
    }
  ]
}
```

**Errors:**
- `403` - Only advisors or admins can manage contracts

---

### Get Contract
**GET** `/api/v1/contracts/{contract_id}`

Returns contract with all installments.

**Response `200`:**
```json
{
  "id": "uuid",
  "lote_id": "uuid",
  "prospect_id": "uuid",
  "sold_by_advisor_id": "uuid",
  "contract_date": "2024-01-15T10:00:00Z",
  "total_amount": 100000.00,
  "unit_type": "pesos",
  "status": "active",
  "installments_count": 24,
  "interest_base_amount": 80000.00,
  "interest_rate_percent": 2.5,
  "interest_periodicity": "mensual",
  "amortization_type": "frances",
  "installments": [
    {
      "id": "uuid",
      "sequence_number": 1,
      "amount": 4166.67,
      "due_date": "2024-02-15T10:00:00Z",
      "status": "paid",
      "capital_portion": 3333.33,
      "interest_portion": 833.34
    }
  ]
}
```

**Errors:**
- `404` - Contract not found
- `403` - No access to this contract

---

### Create Contract
**POST** `/api/v1/contracts`

Creates a sale contract with installment schedule. Requires `advisor` or `super_admin` role.

**Contract Forms:**

**Forma A (Pesos with interest - French amortization):**
```json
{
  "lote_id": "uuid",
  "prospect_id": "uuid",
  "sold_by_advisor_id": "uuid",
  "contract_date": "2024-01-15T10:00:00Z",
  "unit_type": "pesos",
  "installments_count": 24,
  "interest_base_amount": 80000.00,
  "interest_rate_percent": 2.5,
  "interest_periodicity": "mensual",
  "amortization_type": "frances"
}
```

**Forma B (Pesos total direct):**
```json
{
  "lote_id": "uuid",
  "prospect_id": "uuid",
  "sold_by_advisor_id": "uuid",
  "contract_date": "2024-01-15T10:00:00Z",
  "unit_type": "pesos",
  "installments_count": 24,
  "total_acordado": 100000.00
}
```

**USD/Cemento:**
```json
{
  "lote_id": "uuid",
  "prospect_id": "uuid",
  "sold_by_advisor_id": "uuid",
  "contract_date": "2024-01-15T10:00:00Z",
  "unit_type": "dolares",
  "installments_count": 12,
  "total_amount": 10000.00
}
```

**Response `201`:** Contract with installments.

**Errors:**
- `403` - No access to lot
- `404` - Lot or prospect not found
- `400` - Invalid contract form

---

### List Installments
**GET** `/api/v1/contracts/installments`

Lists installments across contracts. Requires `advisor` or `super_admin` role.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `contract_id` | UUID | Filter by contract |
| `status` | string | `pending` or `paid` |

**Response `200`:**
```json
{
  "installments": [
    {
      "id": "uuid",
      "sequence_number": 1,
      "amount": 4166.67,
      "due_date": null,
      "status": "pending",
      "capital_portion": 3333.33,
      "interest_portion": 833.34
    }
  ]
}
```

---

### Mark Installment Paid
**POST** `/api/v1/contracts/installments/{installment_id}/pay`

Marks an installment as paid. Requires `advisor` or `super_admin` role.

**Request Body:**
```json
{
  "amount": 4166.67,
  "paid_at": "2024-02-15T14:00:00Z",  // optional, defaults to now
  "rate_ars_per_usd": 850.00,          // optional
  "rate_ars_per_cement_bag": 7500.00   // optional
}
```

**Response `200`:**
```json
{
  "payment": {
    "id": "uuid",
    "installment_id": "uuid",
    "paid_at": "2024-02-15T14:00:00Z",
    "amount": 4166.67,
    "rate_ars_per_usd": 850.00,
    "rate_ars_per_cement_bag": null
  },
  "installment": {
    "id": "uuid",
    "sequence_number": 1,
    "amount": 4166.67,
    "due_date": null,
    "status": "paid",
    "capital_portion": 3333.33,
    "interest_portion": 833.34
  }
}
```

**Errors:**
- `404` - Installment or contract not found
- `400` - Installment already paid
- `403` - No access

---

## Activity Logs

Tracks CRM activity (calls, meetings, notes, etc.) per entity.

### Create Activity Log
**POST** `/api/v1/activity-logs`

Creates a new activity log entry.

**Request Body:**
```json
{
  "activity_type": "call_made",
  "entity_type": "prospect",
  "entity_id": "uuid",
  "lote_owner_id": "uuid",
  "description": "Llamada de seguimiento",  // optional (max 500)
  "extra_data": {}  // optional
}
```

**Response `201`:**
```json
{
  "id": "uuid",
  "activity_type": "call_made",
  "entity_type": "prospect",
  "entity_id": "uuid",
  "lote_owner_id": "uuid",
  "user_id": "uuid",
  "description": "Llamada de seguimiento",
  "extra_data": null,
  "created_at": "2024-01-15T10:30:00Z",
  "user_full_name": "Juan Perez"
}
```

**Errors:**
- `403` - No access to the specified `lote_owner_id`
- `404` - Entity not found

---

## Enums Reference

### UserRole
| Value | Description |
|-------|-------------|
| `super_admin` | Super administrator |
| `lote_owner` | Land lot owner |
| `advisor` | Sales advisor |

### LoteStatus
| Value | Description |
|-------|-------------|
| `available` | Available for sale |
| `sold` | Sold |
| `reserved` | Reserved |

### ProspectCategory
| Value | Description |
|-------|-------------|
| `primer_contacto` | First contact |
| `seguimiento` | Follow-up |
| `negociacion` | Negotiation |
| `vendido` | Sold |

### ProspectOrigin
| Value | Description |
|-------|-------------|
| `web_platform` | Created from web platform (CRM) |
| `visor_whatsapp` | Created via 360° visor - WhatsApp |
| `visor_direct` | Created via 360° visor - Direct contact |
| `visor_google` | Created via 360° visor - Google |
| `visor_tiktok` | Created via 360° visor - TikTok |
| `visor_facebook` | Created via 360° visor - Facebook |
| `visor_youtube` | Created via 360° visor - YouTube |

### PaymentMethod
| Value | Description |
|-------|-------------|
| `contado` | Cash |
| `credito` | Credit |

### ContractUnit
| Value | Description |
|-------|-------------|
| `pesos` | Argentine Pesos |
| `dolares` | US Dollars |
| `cemento` | Cement Bags |

### ContractStatus
| Value | Description |
|-------|-------------|
| `active` | Active contract |
| `cancelled` | Cancelled contract |

### InstallmentStatus
| Value | Description |
|-------|-------------|
| `pending` | Payment pending |
| `paid` | Paid |

### InterestPeriodicity
| Value | Description |
|-------|-------------|
| `mensual` | Monthly |
| `anual` | Yearly |

### AmortizationType
| Value | Description |
|-------|-------------|
| `frances` | French amortization |

### ActivityType

**CRM Interactions:**
| Value | Description |
|-------|-------------|
| `call_made` | Outgoing call |
| `meeting_scheduled` | Meeting scheduled |
| `meeting_completed` | Meeting completed |
| `note_added` | Note added |
| `prospect_contacted` | Prospect contacted |
| `email_sent` | Email sent |

**CRUD Operations - Prospect:**
| Value | Description |
|-------|-------------|
| `prospect_created` | Prospect created |
| `prospect_updated` | Prospect updated |
| `prospect_deleted` | Prospect deleted |

**CRUD Operations - Lote:**
| Value | Description |
|-------|-------------|
| `lote_created` | Lot created |
| `lote_updated` | Lot updated |
| `lote_deleted` | Lot deleted |

**CRUD Operations - Loteo:**
| Value | Description |
|-------|-------------|
| `loteo_created` | Loteo created |
| `loteo_updated` | Loteo updated |
| `loteo_deleted` | Loteo deleted |

**Generic:**
| Value | Description |
|-------|-------------|
| `other` | Other activity |

### EntityType
| Value | Description |
|-------|-------------|
| `prospect` | Prospect entity |
| `lote` | Lot entity |
| `contract` | Contract entity |

---

## Error Responses

All errors follow this format:
```json
{
  "detail": "Error message describing the issue"
}
```

Common HTTP status codes:
| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `204` | No Content (successful delete) |
| `400` | Bad Request |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | Not Found |
| `422` | Validation Error |
| `500` | Internal Server Error |

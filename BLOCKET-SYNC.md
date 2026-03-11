# Blocket-synk — Lägga till bilar från Blocket

## Översikt
Bilar synkas manuellt från Blocket dealer-sida till Supabase-databasen.
- **Dealer-sida:** https://www.blocket.se/mobility/dealer/7514308/begbilnorr
- **Supabase Project:** `lgtmzyspwbdjukoozwec`
- **Storage Bucket:** `car-images` (public)

---

## Steg 1: Hämta bilar från Blocket

### Öppna dealer-sidan
Gå till https://www.blocket.se/mobility/dealer/7514308/begbilnorr och lista alla bilar.

### Jämför med databasen
Kör SQL för att se aktiva bilar:
```sql
SELECT reg_no, full_name, price, is_active, is_sold FROM cars WHERE is_active = true ORDER BY created_at DESC;
```

### Identifiera ändringar
| Scenario | Åtgärd |
|----------|--------|
| Ny bil på Blocket, inte i DB | INSERT ny rad |
| Bil på Blocket, markerad `is_sold=true` i DB | UPDATE: `is_active=true, is_sold=false`, uppdatera pris/beskrivning |
| Bil i DB men INTE på Blocket | UPDATE: `is_active=false, is_sold=true` |
| Pris ändrat på Blocket | UPDATE pris i DB |

---

## Steg 2: Hämta data från varje ny bil

Öppna varje bils Blocket-annons (t.ex. `https://www.blocket.se/mobility/item/{id}`) och hämta:

### Obligatoriska fält
| Fält | Var på Blocket | DB-kolumn |
|------|----------------|-----------|
| Registreringsnummer | Under "Specifikationer" | `reg_no` |
| Märke | Specifikationer | `brand` |
| Modell | Specifikationer | `model` |
| Variant/Fullständigt namn | Rubrik på annonsen | `full_name` |
| Modellår | Specifikationer | `year` |
| Miltal | Specifikationer (ta bort "mil") | `mileage` (integer) |
| Drivmedel | Specifikationer | `fuel_type` |
| Växellåda | Specifikationer → "Automatisk"/"Manuell" | `gearbox` → "Automat"/"Manuell" |
| Biltyp | Specifikationer | `body_type` |
| Pris | "Totalt pris" | `price` (integer) |
| Beskrivning | Beskrivningstext | `description` |
| Utrustning | Utrustningslista | `equipment` (text[]) |

### Genererade fält
| Fält | Format | Exempel |
|------|--------|---------|
| `slug` | `{märke}-{modell}-{år}-{reg_no}` (lowercase) | `mitsubishi-outlander-2010-kpy911` |
| `is_active` | `true` | |
| `is_sold` | `false` | |

### Hämta bilder
Extrahera bild-URLer från sidans HTML:
```javascript
// I Chrome DevTools Console:
const html = document.documentElement.innerHTML;
const itemId = window.location.pathname.split('/').pop();
const matches = html.match(new RegExp(`https://images\\.blocketcdn\\.se/dynamic/default/item/${itemId}/[^"'\\s)]+`, 'g')) || [];
const uniqueUrls = [...new Set(matches)];
console.log(JSON.stringify(uniqueUrls, null, 2));
```

---

## Steg 3: Ladda upp bilder till Supabase Storage

### Namnkonvention
```
car-images/{REG_NO}/{REG_NO}_01.webp
car-images/{REG_NO}/{REG_NO}_02.webp
...
```

### Ladda ner från Blocket
```bash
mkdir -p /tmp/car-images/{REG_NO}
curl -sL "https://images.blocketcdn.se/dynamic/default/item/{ITEM_ID}/{UUID}" -o /tmp/car-images/{REG_NO}/{REG_NO}_01.webp
# Upprepa för alla bilder...
```

### Ladda upp till Supabase Storage
```bash
SUPABASE_URL="https://lgtmzyspwbdjukoozwec.supabase.co"
ANON_KEY="<anon key>"

for i in $(seq -w 1 9); do
  curl -s -X POST \
    "${SUPABASE_URL}/storage/v1/object/car-images/{REG_NO}/{REG_NO}_0${i}.webp" \
    -H "Authorization: Bearer ${ANON_KEY}" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: image/webp" \
    -H "x-upsert: true" \
    --data-binary @"/tmp/car-images/{REG_NO}/{REG_NO}_0${i}.webp"
done
```

### Bild-URLer i databasen
```
https://lgtmzyspwbdjukoozwec.supabase.co/storage/v1/object/public/car-images/{REG_NO}/{REG_NO}_01.webp
```

---

## Steg 4: Spara i databasen

### INSERT ny bil
```sql
INSERT INTO cars (
  reg_no, slug, brand, model, variant, full_name, year, mileage,
  fuel_type, gearbox, body_type, price, description, specifications,
  equipment, images, is_active, is_sold, is_vat_deductible
) VALUES (
  'ABC123',
  'marke-modell-year-abc123',
  'Märke',
  'Modell',
  'Variant',
  'Full Name',
  2024,
  15000,
  'Bensin',
  'Automat',
  'SUV',
  149950,
  'Beskrivning med riktiga radbrytningar (använd faktiska newlines, INTE literal \n)',
  '{"Märke": "...", "Modell": "...", ...}',
  ARRAY['ABS','AC','Airbag fram',...],
  ARRAY['https://...01.webp','https://...02.webp',...],
  true, false, false
);
```

### VIKTIGT: Beskrivningar
Använd **riktiga radbrytningar** i description-fältet, INTE `\n` som text.
Om du använder Supabase SQL-editor: skriv radbrytningar direkt.
Om du använder REST API: skicka JSON med `\n` (som tolkas som newline av JSON-parsern).

### Återaktivera såld bil
```sql
UPDATE cars SET
  is_active = true, is_sold = false,
  price = {nytt_pris},
  description = '{ny beskrivning}',
  images = ARRAY['{nya bild-URLer}'],
  updated_at = NOW()
WHERE reg_no = '{REG_NO}';
```

### Markera som såld
```sql
UPDATE cars SET is_active = false, is_sold = true, updated_at = NOW()
WHERE reg_no = '{REG_NO}';
```

---

## Steg 5: SEO & Bildoptimering

### Alt-texter på bilder
Bilderna visas på `[slug].astro` med följande alt-text:

| Bild | Alt-text |
|------|----------|
| Huvudbild | `Begagnad {full_name} {year} till salu i Luleå — {price}` |
| Thumbnails | `{full_name} — bild {i} av {total}: {vy}` |

### Structured Data (JSON-LD)
Varje bilsida genererar automatiskt:
- **Car schema** — märke, modell, år, miltal, bränsle, pris, bilder
- **BreadcrumbList** — Hem > Bilar > {Bilnamn}
- **Offer** — pris i SEK, InStock, säljare Begbilnorr

Kontrollera att dessa fält finns:
```json
{
  "@type": "Car",
  "name": "full_name",
  "brand": {"@type": "Brand", "name": "brand"},
  "model": "model",
  "vehicleModelDate": "year",
  "mileageFromOdometer": {"value": mileage, "unitCode": "KMT"},
  "fuelType": "fuel_type",
  "vehicleTransmission": "gearbox",
  "vehicleConfiguration": "Used",
  "color": "färg (om tillgänglig)",
  "image": ["alla bild-URLer"],
  "description": "kort beskrivning",
  "offers": {
    "price": price,
    "priceCurrency": "SEK",
    "availability": "InStock",
    "itemCondition": "https://schema.org/UsedCondition"
  }
}
```

### Meta-taggar (automatiskt)
- **Title:** `{full_name} — {price} | Begbilnorr Luleå`
- **Description:** Beskrivning eller fallback med pris + garanti + finansiering
- **og:type:** `product`
- **og:image:** Huvudbild
- **product:price:** Pris i SEK

### SEO-checklista per bil
- [ ] Beskrivning har riktiga radbrytningar (inte `\n`)
- [ ] Bilder uppladdade till Supabase Storage (inte Blocket CDN)
- [ ] Alt-text på huvudbild inkluderar bilnamn + plats
- [ ] Slug är SEO-vänlig: `{märke}-{modell}-{år}-{reg}`
- [ ] Utrustningslista finns
- [ ] Specifications JSON finns
- [ ] Pris stämmer överens med Blocket

---

## Rensa temp-filer
```bash
rm -rf /tmp/car-images
```

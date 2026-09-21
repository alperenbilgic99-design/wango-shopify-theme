# wango temasını Shopify'a yükleme

## 1 · Temayı yükle
`wango-shopify-theme` klasörünü zip'le (klasörün **içindekiler** kök olacak şekilde)
ve Online Store → Themes → Add theme → Upload zip.

Ya da Shopify CLI ile:
```
cd wango-shopify-theme
shopify theme push --unpublished
```

## 2 · Videoları ve sesi yükle  ← ATLAMA
Shopify tema `assets/` klasörüne video ve ses dosyası kabul etmez. Bu yüzden
`extras/media/` klasöründeki 5 dosya **Content → Files**'a yüklenir ve
CDN bağlantıları tema düzenleyicideki ilgili ayara yapıştırılır:

| Dosya | Bölüm | Ayar |
|---|---|---|
| `hero-scrub.mp4` | Origin · kelime maskesi | Video URL'si |
| `wango-reveal-full-16s.mp4` | Ürün · kutu açılışı | Video URL'si (üretimden çıkan ham video, beyaz zeminli) |
| `wango-explode-alpha.webm` | Ürün · patlatılmış görünüm | WebM URL'si |
| `wango-explode-black-720p.mp4` | Ürün · patlatılmış görünüm | MP4 URL'si |
| `pub-ambience.mp3` | Ürün · gürültü filtresi | Ortam sesi URL'si |

Bağlantı boş kalırsa o bölümler poster görselle çalışmaya devam eder — sayfa
kırılmaz, sadece hareket olmaz.

## 3 · Ürünleri içe aktar
`extras/wango-products.csv` → Products → Import. İki SKU gelir (Origin WOB 3.490 ₺,
Origin WOB · Çift 6.290 ₺). Ürün görsellerini sonra Shopify'dan yükle;
`skiper-ui-lab/public/wango-product/` klasöründeki kareler hazır.

## 4 · Sayfaları oluştur ve şablon ata
Online Store → Pages → Add page. Başlık serbest, **URL handle** ve şablon önemli:

| Handle | Şablon |
|---|---|
| `setler` | `page.setler` (ürün hikâyesi sayfası) |
| `destek` | `page.destek` (SSS) |
| `bulten` | `page.bulten` (bülten kaydı) |

## 5 · Menüleri kur
Navigation → Main menu: Origin (`/`) · wango (`/pages/setler`) ·
Satın al (koleksiyon) · Kayıt ol (`/pages/bulten`) · Destek (`/pages/destek`).
Başlık bölümünde "Açılır menü" ayrı bırakılırsa üst menü kullanılır.

## 6 · Koleksiyon
"Ürün · set ızgarası" bölümüne setleri içeren koleksiyonu seç.

---

## Next.js sürümünden farklar (bilerek)
- **Sepet ve ödeme Shopify'ın kendisi.** `/sepet` ve `/odeme` sayfalarındaki
  localStorage sepeti ve ödeme sağlayıcısı bağlı olmayan sahte ödeme formu
  kaldırıldı; sepet Shopify AJAX Cart API'sine, ödeme gerçek Shopify
  checkout'una gidiyor.
- **Bülten gerçekten kaydediyor.** Form Shopify'ın `customer` formuna gidiyor,
  adres `newsletter` etiketiyle müşteri listesine düşüyor. Bu yüzden eski
  "demo, hiçbir yere gönderilmiyor" uyarısı da kaldırıldı.
- **Renk seçenekleri gerçek varyant.** Eskiden sadece fotoğraf değişiyordu;
  artık seçenek gerçek bir varyantı (kendi fiyatı, stoğu, görseli) seçiyor.
- **Fiyatlar mağazadan geliyor**, koda gömülü değil.
- **three.js kaldırıldı** — dört efektin GLSL'i birebir aynı, çalıştıran kod
  385 KB'lık kütüphane yerine ~150 satırlık `wango-gl.js`.

## Yeni eklenenler (bu sürümde)
- **Ürün · dönen kutu** — sabitlenmiş scroll reveal: kutu 4 tam tur döner, daire şeklinde
  bir geçişle başlığa açılır. Model artık three.js değil, `assets/wango-case-3d.js`
  (ham WebGL, ~300 satır). Geometri aynı formüllerle üretiliyor; fark, three'nin PBR
  malzemesi yerine elle ayarlanmış bir gölgelendirici kullanılması. Yan yana
  baktım: renk ve form orijinaliyle uyuşuyor, orijinaldeki gibi model daire
  geçişinden sonra kâğıt zeminin arkasında kalıyor.
- **Ürün · 360° galeri** — eğik oval üzerinde dönen kareler; wheel ile hızlanır,
  üzerine gelince büyür, diğerleri kararır.

## Taşınmayanlar
- Origin'deki **Galeri** ızgarası ve **portre geçişi** hâlâ brief yer tutucu
  kareleri kullanıyor (Next.js sürümünde de öyleydi).

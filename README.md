# wango Origin — Shopify teması (Dawn formatı)

Online Store 2.0 yapısı: `layout/`, `sections/` (+ section groups), `snippets/`,
`templates/*.json`, `config/`, `locales/`, `assets/`.

Kurulum ve medya adımları için **extras/KURULUM.md** dosyasına bak.

## Bölümler
Origin: açılış (WebGL dissolve) · kelime maskesi · sürüklenen şerit · geçiş ·
anlar · galeri · portre geçişi · yazı duvarı · ikiye ayrılan panel · senaryolar · kapanış.
Ürün: kutu açılışı · set ızgarası · patlatılmış görünüm · gürültü filtresi ·
kısa hikâye · dönen kutu · 360° galeri · rakamlar · teknik · yorumlar.

## Üçüncü taraf
- GSAP 3.15 (gsap, ScrollTrigger, Flip, CustomEase) — GreenSock Standard "no charge" lisansı.
- Lenis 1.3 — MIT.
- three.js **kullanılmıyor**: dört WebGL efekti tam ekran quad olduğu için GLSL birebir
  taşındı (`assets/wango-gl.js`); dönen kutu ham WebGL ile çiziliyor (`assets/wango-case-3d.js`).
- SplitText — GSAP 3.15 ile birlikte gelen aynı GreenSock lisansı.

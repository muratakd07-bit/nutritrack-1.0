# Coach / Rules Domain — Sınırlar

Bu klasör, ileride eklenecek AI beslenme koçu / kural motoru için mimari
sınırı tanımlar. Şu an bir AI entegrasyonu **yoktur** — burada yalnızca
sınır (boundary) kurulmuştur.

## Kesin kurallar

1. **Nutrition hesaplayamaz.** Coach modülleri
   [`domain/nutrition/contract.ts`](../nutrition/contract.ts)'ı asla
   import etmemeli. Kalori/makro/fiber değerlerine ihtiyacı varsa
   [`getCoachContext`](./readModel.ts) üzerinden zaten hesaplanmış/
   kaydedilmiş verileri okur.
2. **Hedef belirleyemez.** [`domain/goals/service.ts`](../goals/service.ts)
   içindeki `setGoalsForUser` asla buradan çağrılmamalı. Hedefler yalnızca
   trainer veya sistem tarafından belirlenir (bkz. AGENTS.md).
3. **Tek giriş noktası:** [`readModel.ts`](./readModel.ts) içindeki
   `getCoachContext(userId)`. Coach kodu veritabanına veya diğer domain
   servislerine doğrudan erişmemeli, hep bu fonksiyon üzerinden geçmeli —
   böylece yukarıdaki iki kural tek bir dosyada denetlenebilir kalır.

## Neden

ADIM 16 nutrition source of truth kuralı, coach/AI dahil hiçbir modülün
nutrition sonucu üretememesini şart koşar. Bu klasördeki yapı, bu kuralı
"hatırlatma" değil, "import edilebilecek yüzeyi daraltarak" mimari olarak
zorlaştırma amacı taşır.

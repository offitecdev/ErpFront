# Wareneingang — vorläufig STILLGELEGT (Vorgabe Samet, 22.09.2026)

«Mal kabul bölümünü şimdilik kaldır sistemden, yani dosyaları gizle.»

Die beiden Reitertafeln des Wareneingangs liegen hier, **ausserhalb von `src/`** —
`tsconfig.app.json` hat `include: ["src"]`, also werden sie weder geprüft noch
gebaut. Gelöscht sind sie nicht: «şimdilik» heisst, sie kommen wieder.

## Was mit ihnen zusammen ruht

* `OrderWorkspacePage.tsx` trägt die Reiter **Mal kabul** und **Stoğa gidenler**
  nicht mehr, und mit ihnen ist der Knopf «Mal kabulü sil» gegangen.
* An seiner Stelle steht **«Siparişi onayla»**: EIN Klick, keine Rückfrage, und
  der Auftrag bekommt das orange Etikett **MAL KABULDE** (`TO_BE_STOCKED`).
  Daneben «Onayı geri al» für den Fall, dass es ein Fehlgriff war.
* `/inventory/orders/:id/receive` leitet auf die Auftragsseite ohne Reiter.

## Was im Server ABSICHTLICH stehen geblieben ist

`POST /inventory/purchase-orders/:id/receive`, `…/receive/revert` und
`…/receive/revert-line` sind unverändert da. Sie sind reine Zusatzwege — nichts
im Ablauf verlangt sie, und ohne sie könnte der Wareneingang später nicht ohne
Servermigration zurückkommen. `COMPLETED` wird dadurch heute von niemandem mehr
gesetzt; die Oberfläche kommt damit klar (ein `COMPLETED`-Auftrag öffnet sich,
seine Tabelle ist nur gesperrt).

## Zurückholen

1. Die beiden Dateien nach `src/pages/inventory/workspace/` schieben.
2. In `OrderWorkspacePage.tsx` die zwei Reiter, ihre Zähler
   (`receiptOpenCount` / `stockedCount`), den Zustand `receiveImport` samt der
   Weiche im `SupplierImportDialog.onApply` und den Knopf «Mal kabulü sil»
   wieder einsetzen — der Verlauf dieses Tages zeigt sie vollständig.
3. `canReceiveGoods` / `canRevertReceipt` in `utils/orderStatus.ts` wieder
   anlegen (sie sind dort mit einem Hinweis vermerkt).

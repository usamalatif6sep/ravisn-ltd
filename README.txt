RAVISN LTD - ADMIN PANEL AND RESELLER WEBSITE
==============================================

TWO SEPARATE SIDES
  Admin panel (private, you only):  http://127.0.0.1:47321/admin/
  Reseller website preview:         http://127.0.0.1:47322/
  Both run only on this computer. The reseller website becomes public only when you
  publish an approved release to Cloudflare Pages (see below).

STARTING
  Double-click "Ravisn" on the desktop (also in the Start menu and in this folder).
  It starts both servers and opens the admin panel in your normal browser.
  The first time, the admin panel asks you to create your admin password (12+ characters).
  Forgotten password: run   Ravisn.cmd --reset-password   in this folder.

STOPPING
  Admin panel > Settings > About > Quit Ravisn, or restart Windows.

PUBLISHING THE RESELLER WEBSITE
  1. Admin > Website > Build release. This takes a snapshot of the catalogue using only
     public fields, leaves out products held back in Review, and checks every file for
     supplier names, phone numbers, emails, SKUs and private notes.
  2. Open preview (http://127.0.0.1:47322/) and check it.
  3. Approve the release.
  4. Connect Cloudflare (free account, Account ID + API token with "Cloudflare Pages: Edit"
     and "D1: Edit"), then Website > Order service > Set up order service (creates the D1
     database for orders and chats and two secrets), then Publish and type the project name.
     Address: https://<project>.pages.dev
  5. After publishing: Website > Manage orders and chats from > Online service.
  Nothing is uploaded until you do step 4 yourself. Supplier data and costs never leave
  this computer; the online database holds only orders, delivery details and chats.

ORDERS AND LIVE CHAT
  Resellers add products to an order, enter delivery details, review and send. A sent
  order is a request (status New, payment Pending confirmation): nothing is paid until you
  mark it paid. Admin > Orders shows reseller and delivery details, supplier and cost
  (private), expected margin, statuses, tracking, updates for the reseller, private notes
  and history. Admin > Live chat: switch on "Available" to show the team as online, take
  over from the automated assistant, reply, close or archive. Retention: gear icon.
  The assistant answers only from the public catalogue and policies.

PRODUCT PHOTOS
  Admin > Product photos. eBay listing photos are looked up through eBay's official API
  using your own free developer keys (developer.ebay.com). You can also upload your own
  photos from any product. Only verified or approved photos are published; other products
  show "Photo coming soon".
  When a listing has ended, "Find replacement photos" searches eBay (same official API) for
  another live listing of the SAME product in that country. Brand, model, size, count, colour
  and version must all agree; nothing is approved automatically. Check the candidates in
  step 3 (filter "High confidence" first). "Download report (CSV)" lists every search, what
  eBay said about the original listing, and why other listings were rejected. It stays within
  eBay's daily allowance; click it again the next day to continue.

WHERE THINGS ARE
  app\backend           Server code (Python)
  app\frontend          Admin panel
  app\public-site       Reseller website
  app\deploy            Cloudflare publishing tool (used only when you publish)
  data\ravisn.db        Your data: products, suppliers, prices, history
  data\backups\         Automatic backups (daily while open, and before risky changes)
  data\public\releases  Website releases (public data only)
  data\images\          Photos you upload
  data\exports\         Excel exports (customer and PRIVATE)
  data\secrets.bin      eBay and Cloudflare keys, encrypted for your Windows account
  snapshots\            Copy of the previous desktop version

  The original workbooks in Downloads\ravisn project were never modified.

ResellerScan Privacy Policy
Effective Date: June 14, 2026
This Privacy Policy explains how ResellerScan collects, uses, and shares information when you use the ResellerScan mobile application.
1. Information We Collect
ResellerScan is designed to minimize the information it collects.
The app may process the following categories of information:
Barcode and product code data. When you scan a barcode or manually enter a UPC or EAN, the code is used to request pricing and resale estimate data.
Camera access. On supported iOS devices, the app uses your camera to scan barcodes. Barcode recognition is performed on-device using Apple system frameworks. The app does not send your camera feed or photos to our servers through the current app implementation.
Purchase and subscription status. If you purchase or restore ResellerScan Pro, the app receives subscription and entitlement information from Apple through StoreKit so it can unlock paid features.
Limited device-stored usage data. The app stores your remaining free daily scan count and the date used to reset that count in UserDefaults on your device.
In-session scan history. The app keeps a short list of recent lookups in memory during the current app session so you can reopen results. In the current implementation, that recent lookup list is not persisted by the app after the session ends.
2. How We Use Information
We use information to:
scan barcodes and accept manual product-code entry;
fetch market data and estimated resale metrics for scanned items;
display product details, eBay pricing estimates, and related listing links;
enforce the free-plan daily scan limit;
process, restore, and verify subscriptions through Apple; and
maintain app functionality, security, and reliability.
3. Network Requests and Third-Party Services
When you perform a lookup, the app sends the scanned or entered UPC/EAN code to the market-data endpoint configured in the app:
[https://resellerscan2.vercel.app/api/scan](https://resellerscan2.vercel.app/api/scan)
That service returns market data used to populate the results screen.
The app also interacts with third parties in the following ways:
Apple StoreKit is used for subscription product loading, purchase flow, restore purchases, and entitlement verification.
Product images may be loaded from remote image URLs returned by the market-data response.
The app provides links to eBay search results and listing pages in your browser.
Those third parties may collect information under their own terms and privacy policies.
4. What We Do Not Currently Collect
Based on the current app implementation, ResellerScan does not include:
account registration or user profiles;
direct collection of your name, email address, phone number, or mailing address;
in-app analytics or advertising SDKs;
app-based location tracking;
contact, microphone, photo-library, or calendar access; or
persistent cloud storage of your recent scan history by the app itself.
5. Data Sharing
We do not sell your personal information.
We may share limited information only as needed to operate the app, including:
product codes you submit for lookup with the hosted market-data service;
purchase-related information handled by Apple for subscriptions; and
requests to third-party URLs when product images or external eBay pages are opened.
6. Data Retention
The app’s current implementation retains data as follows:
Free scan count and reset date remain on your device until they are updated, reset, or removed with the app’s local data.
Recent lookup cards are stored in memory for the active session only and are not intentionally persisted by the app.
Subscription records are managed by Apple according to Apple’s systems and policies.
Server-side retention for the hosted market-data endpoint may depend on the hosting provider or backend configuration and should be disclosed consistently with backend operations.
7. Your Choices
You can:
deny camera permission and use manual entry instead;
manage or cancel subscriptions through your App Store account settings;
stop using the app at any time; and
remove locally stored app data by deleting the app, subject to Apple’s system behavior.
8. Children’s Privacy
ResellerScan is not directed to children under 13, and we do not knowingly collect personal information from children under 13 through the current app implementation.
9. Security
We use the security features provided by Apple’s platforms and frameworks, but no method of transmission or storage is completely secure. You should use the app only on devices and networks you trust.
10. Third-Party Services and Websites
This Privacy Policy does not apply to third-party services, websites, or platforms, including Apple, eBay, hosting providers, or remote image hosts. Review their policies before using those services.
11. International Use
If you use the app outside the country where its services or hosting are based, your information may be transferred to and processed in other jurisdictions.
12. Changes to This Privacy Policy
We may update this Privacy Policy from time to time. The updated version will become effective when posted with a revised effective date.
13. Contact
If you have any questions or concerns regarding this Privacy Policy, please contact us at: contact@resellerbooksus.com.

[← Back to Home](./)

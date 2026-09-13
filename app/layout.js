import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'صيدلية الغسق | النظام الداخلي',
  description: 'نظام بحث وإدارة الأدوية الخاص بصيدلية الغسق',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
     <head>
        {/* هذا هو السطر الجديد الذي سيجبر المتصفح على عرض شعارك في التبويب */}
        <link rel="icon" href="/logo.png" /> 
        
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-cairo bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

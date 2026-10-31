import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy notice' };

export default function PrivacyPage() {
  return <main id="main" className="page-shell min-h-[65vh] py-16 sm:py-24">
    <div className="mx-auto w-full max-w-4xl">
    <p className="label mb-5 text-neutral-500">Terasbarber / Legal</p><h1 className="display text-6xl sm:text-8xl">PRIVACY<br />NOTICE.</h1>
    <div className="mt-10 space-y-7 border-t border-black/20 pt-7 text-sm leading-7 text-neutral-700">
      <p>When you request an appointment, the shop receives the name, phone number, selected service, barber, requested time, and optional note you submit. This information is used only to manage and respond to the appointment request.</p>
      <p>Appointment records are stored in the shop&apos;s Supabase database and are visible to authorized shop administrators. The booking form does not collect payment card details. A WhatsApp link is optional and opens WhatsApp only when you choose to follow it.</p>
      <p>Contact the shop using the contact details published on this site to request correction or deletion of your booking data. The shop must add its verified contact information and retention policy before launch.</p>
      <p className="border-l-4 border-lime bg-white p-4 text-xs">This starter privacy notice requires review and completion by the shop owner before production use.</p>
    </div>
    </div>
  </main>;
}

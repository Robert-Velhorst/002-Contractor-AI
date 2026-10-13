import { memo } from 'react'
import ConversationPhoto from './ConversationPhoto'

export default memo(function ClientDeliveryPhotos({ photos, base, token, locale }) {
  return <div className="client-delivery-photos">{photos.map(photo =>
    <ConversationPhoto key={photo.id} base={base} token={token} message={photo} label={photo.filename} locale={locale} />
  )}</div>
})

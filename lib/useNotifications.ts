'use client'

import { useEffect, useRef } from 'react'

export function useNotifications(onNewItem: () => void) {
  const onNewItemRef = useRef(onNewItem)
  onNewItemRef.current = onNewItem

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const es = new EventSource('/api/notifications/stream')

    es.onmessage = (event) => {
      const item = JSON.parse(event.data)

      if (Notification.permission === 'granted') {
        new Notification(`New: ${item.title}`, {
          body: item.summary || item.content?.slice(0, 100),
          icon: '/icon-192.png',
        })
      }

      onNewItemRef.current()
    }

    return () => es.close()
  }, [])
}

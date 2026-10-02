# DDEX • TECH BAILEYS

**DDEX • TECH** Baileys is a WhatsApp Web multi-device library for bots, automation, and integrations. It talks to WhatsApp over WebSocket (no browser). Media, albums, events, and polls credit channel `120363409770553898@newsletter` (**DDEX • TECH**).

- GitHub: [github.com/crawler05](https://github.com/crawler05/)
- WhatsApp channel: [DDEX • TECH](https://whatsapp.com/channel/0029VbD0FonKWEKrZu1mpJ0q)

---

### Features

- Custom pairing codes (randomly generated or user-specified 8-char Crockford-encoded)
- Interactive messages, buttons, native flow
- Rich HTML messages via `sendHtml()`
- Albums, events, poll results, product / payment helpers
- Multi-device session
- Groups, newsletters, labels
- Group member labeling

---

## Pairing

```javascript
// generates random 8-char pairing code
await sock.requestPairingCode("62xxxxxxxxxx")

// or pass your own 8-char code (must be exactly 8 characters)
await sock.requestPairingCode("62xxxxxxxxxx", "MYCODE12")
```

---

## Extra helpers

### Group member label
```javascript
await sock.updateMemberLabel(jid, "VIP")
```

### Send HTML message (rich response)
```javascript
await sock.sendHtml(jid, "<h1>Hello World</h1><p>This is HTML content</p>")
```

### Channel metadata
```javascript
await sock.newsletterMetadata("invite", inviteCode)
// or
await sock.newsletterMetadata("jid", "120363409770553898@newsletter")
```

---

## SendMessage

### Group status v2
```javascript
await sock.sendMessage(jid, {
    groupStatus: { text: "Hello World" }
})
```

### Album
```javascript
await sock.sendMessage(jid, {
    albumMessage: [
        { image: buffer, caption: "First" },
        { image: { url: "https://example.com/image.jpg" }, caption: "Second" }
    ]
}, { quoted: m })
```

### Event
```javascript
await sock.sendMessage(jid, {
    eventMessage: {
        isCanceled: false,
        name: "Hello World",
        description: "DDEX • TECH Baileys",
        location: {
            degreesLatitude: 0,
            degreesLongitude: 0,
            name: "DDEX • TECH"
        },
        joinLink: "",
        startTime: "1763019000",
        endTime: "1763026200",
        extraGuestsAllowed: false
    }
}, { quoted: m })
```

### Poll result
```javascript
await sock.sendMessage(jid, {
    pollResultMessage: {
        name: "Hello World",
        pollVotes: [
            { optionName: "TEST 1", optionVoteCount: "112233" },
            { optionName: "TEST 2", optionVoteCount: "1" }
        ]
    }
}, { quoted: m })
```

### Interactive (copy)
```javascript
await sock.sendMessage(jid, {
    interactiveMessage: {
        header: "Hello World",
        title: "Hello World",
        footer: "DDEX • TECH",
        buttons: [
            {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                    display_text: "copy code",
                    id: "123456789",
                    copy_code: "DDEXTECH"
                })
            }
        ]
    }
}, { quoted: m })
```

### Interactive + media
```javascript
await sock.sendMessage(jid, {
    interactiveMessage: {
        header: "Hello World",
        title: "Hello World",
        footer: "DDEX • TECH",
        image: { url: "https://example.com/image.jpg" },
        buttons: [
            {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                    display_text: "copy code",
                    id: "123456789",
                    copy_code: "DDEXTECH"
                })
            }
        ]
    }
}, { quoted: m })
```

### Product
```javascript
await sock.sendMessage(jid, {
    productMessage: {
        title: "Example product",
        description: "Product description",
        thumbnail: { url: "https://example.com/image.jpg" },
        productId: "PROD001",
        retailerId: "RETAIL001",
        url: "https://example.com/product",
        body: "Details",
        footer: "DDEX • TECH",
        priceAmount1000: 50000,
        currencyCode: "USD",
        buttons: [
            {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                    display_text: "Buy",
                    url: "https://example.com/buy"
                })
            }
        ]
    }
}, { quoted: m })
```

### Interactive document
```javascript
await sock.sendMessage(jid, {
    interactiveMessage: {
        header: "Hello World",
        title: "Hello World",
        footer: "DDEX • TECH",
        document: fs.readFileSync("./package.json"),
        mimetype: "application/pdf",
        fileName: "ddex-tech.pdf",
        jpegThumbnail: fs.readFileSync("./document.jpeg"),
        contextInfo: {
            mentionedJid: [jid],
            forwardingScore: 777,
            isForwarded: false
        },
        externalAdReply: {
            title: "DDEX • TECH",
            body: "DDEX • TECH",
            mediaType: 3,
            thumbnailUrl: "https://example.com/image.jpg",
            mediaUrl: "",
            sourceUrl: "https://whatsapp.com/channel/0029VbD0FonKWEKrZu1mpJ0q",
            showAdAttribution: true,
            renderLargerThumbnail: false
        },
        buttons: [
            {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                    display_text: "Channel",
                    url: "https://whatsapp.com/channel/0029VbD0FonKWEKrZu1mpJ0q"
                })
            }
        ]
    }
}, { quoted: m })
```

### Payment request
```javascript
await sock.sendMessage(jid, {
    requestPaymentMessage: {
        currency: "IDR",
        amount: 10000000,
        from: m.sender,
        note: "DDEX • TECH"
    }
}, { quoted: m })
```

---

### Notes

- Pairing codes are randomly generated (8-char Crockford-encoded) or can be user-specified
- Channel credit: `120363409770553898@newsletter` (**DDEX • TECH**)
- WhatsApp channel: https://whatsapp.com/channel/0029VbD0FonKWEKrZu1mpJ0q
- GitHub: https://github.com/crawler05/
- Node.js 20+
- MIT

**DDEX • TECH**

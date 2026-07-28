const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+)/gi

function separateEnding(value) {
  const match = value.match(/^(.*?)([.,!?;:)\]}]+)?$/)
  return { url: match?.[1] || value, ending: match?.[2] || '' }
}

export default function AutoLinkText({ text }) {
  return <span className="auto-link-text">{String(text || '').split(URL_PATTERN).map((part, index) => {
    if (!/^(?:https?:\/\/|www\.)/i.test(part)) return <span key={index}>{part}</span>
    const { url, ending } = separateEnding(part)
    const href = /^www\./i.test(url) ? `https://${url}` : url
    return <span key={index}><a href={href} target="_blank" rel="noopener noreferrer">{url}</a>{ending}</span>
  })}</span>
}

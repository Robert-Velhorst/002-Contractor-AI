import { createElement } from "react"

function Metric({ icon, label, value, hint, tone = 'default' }) {
  return (
    <article className={`metric metric-${tone}`}>
      <span className="metric-icon">{createElement(icon, { size: 18 })}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </article>
  )
}

export { Metric }
export default Metric

"use client"

interface SparklineProps {
  data: Array<{ date: string; count: number }>
  width?: number
  height?: number
  color?: string
}

export function Sparkline({ data, width = 80, height = 24, color = "currentColor" }: SparklineProps) {
  if (data.length < 2) {
    return <svg width={width} height={height} />
  }

  const max = Math.max(...data.map((d) => d.count), 1)
  const min = 0
  const range = max - min || 1

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((d.count - min) / range) * height
    return `${x},${y}`
  })

  const area = [
    `M0,${height}`,
    ...data.map((d, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((d.count - min) / range) * height
      return `L${x},${y}`
    }),
    `L${width},${height}`,
    "Z",
  ].join(" ")

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={area} fill={color} fillOpacity={0.12} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

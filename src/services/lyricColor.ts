/** A legible pastel of a sampled cover color, visibly softer than white. */
export function translationColor(accent:string) {
  const channels=accent.split(',').map(Number);
  if(channels.length!==3 || channels.some(value=>!Number.isFinite(value))) return 'rgb(198, 210, 223)';
  const rgb=channels.map(value=>Math.max(0,Math.min(255,value))/255);
  const low=Math.min(...rgb),high=Math.max(...rgb),range=high-low;
  // Preserve the sample's hue, including truly neutral monochrome artwork.
  // Fixed lightness keeps even a dark secondary sample readable; the saturation
  // ceiling keeps vivid covers pastel without washing their color into white.
  const saturation=range ? Math.min(.65,1.15*range/(1-Math.abs(high+low-1))) : 0;
  const chroma=.36*saturation,base=.82-chroma/2;
  return `rgb(${rgb.map(value=>Math.round(255*(base+(range ? (value-low)/range*chroma : 0)))).join(', ')})`;
}

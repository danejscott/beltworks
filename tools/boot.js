// Dev helper: make sure the Creative Playthrough world is loaded and the playthrough tools are on window.
export async function boot() {
  const BW = window.BW;
  if (BW.G.ents.size < 50) {
    const b = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Play') && b.parentElement.parentElement.textContent.includes('Creative Playthrough'));
    if (!b) return 'no save button';
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click();
    for (let i = 0; i < 40 && BW.G.ents.size < 50; i++) await new Promise(r => setTimeout(r, 250));
  }
  window.P = await import('/tools/pt.js'); window.S3 = await import('/tools/stage3.js');
  const E = [...BW.G.ents.values()];
  window.HUB = E.find(e => e.type === 'hub'); window.ELV = E.find(e => e.type === 'elevator');
  window.B3 = E.filter(e => e.type === 'manufacturer' && (e.recipe === 'modular_engine' || e.recipe === 'adaptive_control_unit'));
  return 'ok ' + BW.G.ents.size;
}

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ImagePlus, ScanLine } from 'lucide-react';
import { TopBar } from '../components/ui.jsx';
import { useApp } from '../app-context.jsx';
import { parseBusinessCard } from '../utils.js';

/** Business card scanner: on-device OCR (tesseract.js) -> pre-filled new contact form. */
export default function ScanCard() {
  const nav = useNavigate();
  const { toast } = useApp();
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const [img, setImg] = useState(null);
  const [progress, setProgress] = useState(null);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);

  const handle = async (file) => {
    if (!file) return;
    setImg(URL.createObjectURL(file));
    setProgress(0);
    try {
      const Tesseract = (await import('tesseract.js')).default;
      const { data } = await Tesseract.recognize(file, 'eng', {
        logger: (m) => m.status === 'recognizing text' && setProgress(Math.round(m.progress * 100)),
      });
      setText(data.text);
      setParsed(parseBusinessCard(data.text));
    } catch (e) {
      toast(`Scan failed: ${e.message}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  const useResult = () => {
    const p = new URLSearchParams(Object.entries({ ...parsed, source: 'business card' }).filter(([, v]) => v));
    nav(`/contacts/new?${p}`);
  };

  return (
    <div className="page">
      <TopBar back title="Scan business card" />
      <div className="container stack">
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files[0])} />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => handle(e.target.files[0])} />
        <div className="card pad" style={{ textAlign: 'center' }}>
          {img ? <img src={img} alt="card" style={{ maxWidth: '100%', borderRadius: 12 }} /> : <ScanLine size={64} color="var(--brand)" strokeWidth={1.2} />}
          <div className="faint" style={{ margin: '10px 0' }}>Take a clear photo of the card on a flat surface. Text is read on your device.</div>
          <div className="row">
            <button className="btn primary grow" onClick={() => camRef.current.click()}><Camera size={18} /> Take photo</button>
            <button className="btn grow" onClick={() => fileRef.current.click()}><ImagePlus size={18} /> From gallery</button>
          </div>
        </div>
        {progress !== null && (
          <div className="card pad">
            <div className="small bold">Reading card… {progress}%</div>
            <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${progress}%` }} /></div>
          </div>
        )}
        {parsed && (
          <div className="card pad stack">
            <div className="bold">Detected details</div>
            {Object.entries(parsed).map(([k, v]) => (
              <label key={k} className="field">
                <span>{k.replace('_', ' ')}</span>
                <input className="input" value={v} onChange={(e) => setParsed({ ...parsed, [k]: e.target.value })} />
              </label>
            ))}
            <details><summary className="faint">Raw text</summary><pre className="small" style={{ whiteSpace: 'pre-wrap' }}>{text}</pre></details>
            <button className="btn primary block" onClick={useResult}>Create contact</button>
          </div>
        )}
      </div>
    </div>
  );
}

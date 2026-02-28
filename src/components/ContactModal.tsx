import { useState, useEffect } from 'react';
import { X, CheckCircle, Send } from 'lucide-react';

export default function ContactModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [carName, setCarName] = useState('');
  const [carSlug, setCarSlug] = useState('');
  const [formState, setFormState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setCarName(detail.carName || '');
      setCarSlug(detail.carSlug || '');
      setMessage(
        detail.carName
          ? `Hej! Jag är intresserad av ${detail.carName}. Jag vill gärna veta mer om bilen och eventuellt boka en provkörning.`
          : ''
      );
      setFormState('idle');
      setErrorMsg('');
      setIsOpen(true);
    };
    window.addEventListener('open-contact-modal', handler);
    return () => window.removeEventListener('open-contact-modal', handler);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormState('sending');
    setErrorMsg('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          message,
          carSlug,
          carName,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Något gick fel');
      }

      setFormState('success');
      setName('');
      setEmail('');
      setPhone('');
      setMessage('');
    } catch (err) {
      setFormState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Något gick fel. Försök igen.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => setIsOpen(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setIsOpen(false)} aria-label="Stäng">
          <X size={18} />
        </button>

        {formState === 'success' ? (
          <div className="form-success">
            <CheckCircle size={48} />
            <h3>Tack för ditt meddelande!</h3>
            <p>Vi återkommer till dig så snart som möjligt.</p>
          </div>
        ) : (
          <>
            <h2>Kontakta oss</h2>
            <p className="modal-subtitle">
              {carName
                ? `Angående: ${carName}`
                : 'Fyll i formuläret så återkommer vi'}
            </p>

            {formState === 'error' && (
              <div className="form-error">{errorMsg}</div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="modal-name">Namn *</label>
                  <input
                    id="modal-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ditt namn"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="modal-phone">Telefon</label>
                  <input
                    id="modal-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07X-XXX XX XX"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="modal-email">E-post *</label>
                <input
                  id="modal-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="din@email.se"
                />
              </div>

              <div className="form-group">
                <label htmlFor="modal-message">Meddelande *</label>
                <textarea
                  id="modal-message"
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Skriv ditt meddelande här..."
                  rows={4}
                />
              </div>

              <button
                type="submit"
                className="submit-btn"
                disabled={formState === 'sending'}
              >
                {formState === 'sending' ? (
                  'Skickar...'
                ) : (
                  <>
                    <Send size={18} />
                    Skicka meddelande
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

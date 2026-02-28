import { useState } from 'react';
import { Send, CheckCircle } from 'lucide-react';

export default function ContactForm() {
  const [formState, setFormState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

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
          message: subject ? `[${subject}] ${message}` : message,
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
      setSubject('');
      setMessage('');
    } catch (err) {
      setFormState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Något gick fel. Försök igen.');
    }
  };

  if (formState === 'success') {
    return (
      <div className="form-success" style={{ padding: '48px 0' }}>
        <CheckCircle size={48} />
        <h3>Tack för ditt meddelande!</h3>
        <p>Vi återkommer till dig så snart som möjligt, vanligtvis inom några timmar.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {formState === 'error' && (
        <div className="form-error">{errorMsg}</div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="contact-name">Namn *</label>
          <input
            id="contact-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ditt namn"
          />
        </div>
        <div className="form-group">
          <label htmlFor="contact-phone">Telefon</label>
          <input
            id="contact-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07X-XXX XX XX"
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="contact-email">E-post *</label>
        <input
          id="contact-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="din@email.se"
        />
      </div>

      <div className="form-group">
        <label htmlFor="contact-subject">Ärende</label>
        <select
          id="contact-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option value="">Välj ärende</option>
          <option value="Köpa bil">Köpa bil</option>
          <option value="Sälja bil">Sälja / byta in bil</option>
          <option value="Finansiering">Finansiering</option>
          <option value="Provkörning">Boka provkörning</option>
          <option value="Övrigt">Övrigt</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="contact-message">Meddelande *</label>
        <textarea
          id="contact-message"
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Beskriv ditt ärende..."
          rows={5}
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
  );
}

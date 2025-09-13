import './TextureSelector.css'

export default function TextureSelector({ value, onChange }) {
    const textures = [
        { id: 'none', name: 'ללא', url: '' },
        { id: 'paper', name: 'נייר', url: 'https://www.transparenttextures.com/patterns/paper-fibers.png' },
        { id: 'linen', name: 'בד', url: 'https://www.transparenttextures.com/patterns/linen.png' },
        { id: 'flowers', name: 'פרחים עדינים', url: 'https://www.transparenttextures.com/patterns/flowers.png' },
        { id: 'wood', name: 'עץ בהיר', url: 'https://www.transparenttextures.com/patterns/wood-pattern.png' },
    ]

    return (
        <div className='texture-selector'>
            {textures.map(tex => (
                <button
                    key={tex.id}
                    className={`texture-option ${value === tex.url ? 'active' : ''}`}
                    style={{
                        backgroundImage: tex.url ? `url(${tex.url})` : 'none',
                        backgroundColor: tex.url ? 'transparent' : '#fff',
                    }}
                    onClick={() => onChange(tex.url)}
                    title={tex.name}
                >
                    {tex.url === '' ? '✖' : ''}
                </button>
            ))}
        </div>
    )
}

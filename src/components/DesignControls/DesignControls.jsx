import TextureSelector from '../TextureSelector/TextureSelector'

export default function DesignControls({ settings, onChange }) {
    const handleUploadTexture = e => {
        const file = e.target.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            onChange({ textureUrl: reader.result })
        }
        reader.readAsDataURL(file)
    }

    return (
        <aside className='design-panel'>
            <h3>🎨 עיצוב הספר</h3>

            <div className='control-group'>
                <label>צבע רקע:</label>
                <input
                    type='color'
                    value={settings.backgroundColor}
                    onChange={e => onChange({ backgroundColor: e.target.value })}
                />
            </div>

            <div className='control-group'>
                <label>פונט:</label>
                <select value={settings.fontFamily} onChange={e => onChange({ fontFamily: e.target.value })}>
                    <option value='David, serif'>David</option>
                    <option value='Arial, sans-serif'>Arial</option>
                    <option value='Courier New, monospace'>Courier New</option>
                    <option value='Guttman Yad-Brush, cursive'>כתב יד</option>
                </select>
            </div>

            <div className='control-group'>
                <label>צבע טקסט:</label>
                <input
                    type='color'
                    value={settings.fontColor}
                    onChange={e => onChange({ fontColor: e.target.value })}
                />
            </div>

            <div className='control-group'>
                <label>גודל טקסט:</label>
                <input
                    type='range'
                    min='12'
                    max='36'
                    value={settings.fontSize}
                    onChange={e => onChange({ fontSize: parseInt(e.target.value) })}
                />
                <span>{settings.fontSize}px</span>
            </div>

            <div className='control-group'>
                <label>צבע מסגרת:</label>
                <input
                    type='color'
                    value={settings.borderColor}
                    onChange={e => onChange({ borderColor: e.target.value })}
                />
            </div>

            <div className='control-group'>
                <label>עובי מסגרת:</label>
                <input
                    type='range'
                    min='0'
                    max='10'
                    value={settings.borderWidth}
                    onChange={e => onChange({ borderWidth: parseInt(e.target.value) })}
                />
                <span>{settings.borderWidth}px</span>
            </div>

            <div className='control-group'>
                <label>עיגול פינות:</label>
                <input
                    type='range'
                    min='0'
                    max='30'
                    value={settings.borderRadius}
                    onChange={e => onChange({ borderRadius: parseInt(e.target.value) })}
                />
                <span>{settings.borderRadius}px</span>
            </div>

            <div className='control-group'>
                <label>טקסטורה מוכנה:</label>
                <TextureSelector value={settings.textureUrl} onChange={url => onChange({ textureUrl: url })} />
            </div>

            <div className='control-group'>
                <label>או העלה טקסטורה משלך:</label>
                <input type='file' accept='image/*' onChange={handleUploadTexture} />
            </div>
        </aside>
    )
}

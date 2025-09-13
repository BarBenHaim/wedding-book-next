import { TemplateClassic, TemplateFramedPhoto, TemplateFloral } from './DesignTemplates'

export default function getTemplateById(templateId, entry) {
    switch (templateId) {
        case 'classic':
            return <TemplateClassic entry={entry} />
        case 'photo':
            return <TemplateFramedPhoto entry={entry} />
        case 'floral':
            return <TemplateFloral entry={entry} />
        default:
            return <div>❌ תבנית לא נמצאה</div>
    }
}

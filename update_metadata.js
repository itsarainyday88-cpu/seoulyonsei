const fs = require('fs');
const path = require('path');

const imgDir = path.join(process.cwd(), 'public', 'images');
const lecturersDir = path.join(imgDir, 'lecturers');
const facilitiesDir = path.join(imgDir, 'facilities');
const metadataPath = path.join(imgDir, 'assets-metadata.json');

const metadata = [];

// Helper to determine tag
function getTag(filename, folder) {
    const lower = filename.toLowerCase();
    if (folder === 'lecturers') {
        if (lower.includes('수학')) return 'math';
        if (lower.includes('국어')) return 'korean';
        if (lower.includes('2인') || lower.includes('부부')) return 'directors';
        return 'group'; // default for lecturers
    } else if (folder === 'facilities') {
        if (lower.includes('외경') || lower.includes('외관')) return 'exterior';
        if (lower.includes('입구')) return 'entrance';
        if (lower.includes('자습')) return 'study_room';
        if (lower.includes('국어') || lower.includes('수학')) return 'classroom'; // fallback for facilities like 국어01
        return 'general';
    }
}

// Read lecturers
if (fs.existsSync(lecturersDir)) {
    const files = fs.readdirSync(lecturersDir);
    files.forEach(file => {
        if (!file.match(/\.(jpg|jpeg|png|webp|gif)$/i)) return; // skip non-images

        const id = 'lec_' + file.split('.')[0].replace(/\s/g, '_');
        const tag = getTag(file, 'lecturers');
        metadata.push({
            id: id,
            category: 'PEOPLE',
            tag: tag,
            path: \`/images/lecturers/\${file}\`,
            original_name: file
        });
    });
}

// Read facilities
if (fs.existsSync(facilitiesDir)) {
    const files = fs.readdirSync(facilitiesDir);
    files.forEach(file => {
        if (!file.match(/\.(jpg|jpeg|png|webp|gif)$/i)) return; // skip non-images
        
        const id = 'fac_' + file.split('.')[0].replace(/\s/g, '_');
        const tag = getTag(file, 'facilities');
        metadata.push({
            id: id,
            category: 'FACILITY',
            tag: tag,
            path: \`/images/facilities/\${file}\`,
            original_name: file
        });
    });
}

fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
console.log('Metadata written with', metadata.length, 'total images.');

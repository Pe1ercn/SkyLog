import { esc } from '../lib/format.js';
import { getLanguage, t } from '../lib/i18n.js';
import { icon } from '../lib/icons.js';
import { openModal } from '../ui/components.js';
import desertPair from '../assets/aviation/gallery/01-desert-pair.jpg';
import skyCarrier from '../assets/aviation/gallery/02-sky-carrier.jpg';
import airRefuel from '../assets/aviation/gallery/03-air-refuel.jpg';
import snowline from '../assets/aviation/gallery/04-snowline.jpg';
import sunriseRamp from '../assets/aviation/gallery/05-sunrise-ramp.jpg';
import noseDome from '../assets/aviation/gallery/06-nose-dome.jpg';

// Visual-only captions. These are public-domain NASA photographs and are not
// presented as type/registration portraits.
const GALLERY = [
  { photo: desertPair, titleZh: '荒漠编队', titleEn: 'Formation over the desert', credit: 'NASA / Jim Ross', id: 'AFRC2025-0168-018' },
  { photo: skyCarrier, titleZh: '背负航天飞机', titleEn: 'Carrying the shuttle', credit: 'NASA / Tony Landis', id: 'EC01-0129-18' },
  { photo: airRefuel, titleZh: '空中加油', titleEn: 'Air-to-air refueling', credit: 'NASA / Carla Thomas', id: 'EC05-0148-30' },
  { photo: snowline, titleZh: '雪山航线', titleEn: 'The snowline route', credit: 'NASA / Jim Ross', id: 'EC98-44444-007' },
  { photo: sunriseRamp, titleZh: '日出停机坪', titleEn: 'Sunrise on the ramp', credit: 'NASA / Tony Landis', id: 'ED06-0202-001' },
  { photo: noseDome, titleZh: '机头与穹顶', titleEn: 'Nose and dome', credit: 'NASA', id: 'GRC-2015-C-07522' },
];

export class GalleryPage {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.bound = false;
  }

  mount() {
    this.update();
  }

  show() {
    this.update();
  }

  update() {
    const lang = getLanguage();
    this.root.innerHTML = `<div class="gallery-page">
      <header class="page-head">
        <div>
          <p class="eyebrow">AIRCRAFT GALLERY</p>
          <h1>${t('飞机图库', 'Aircraft gallery')}</h1>
          <p class="page-sub">${t('来自 NASA 公共领域影像库的航空摄影。只展示画面，不绑定机型与介绍。', 'Aviation photography from NASA’s public-domain image library — pictures only, with no aircraft type or intro attached.')}</p>
        </div>
        <span class="gallery-count">${GALLERY.length} ${t('张照片', 'photos')}</span>
      </header>

      <div class="gallery-grid">
        ${GALLERY.map((item, index) => {
          const name = lang === 'en' ? item.titleEn : item.titleZh;
          return `<button class="gallery-card" type="button" data-gallery-index="${index}" aria-label="${esc(name)}">
            <span class="gallery-photo"><img src="${item.photo}" alt="${esc(name)}" loading="lazy" /></span>
            <span class="gallery-meta">
              <span class="gallery-code">${String(index + 1).padStart(2, '0')} / ${String(GALLERY.length).padStart(2, '0')}</span>
              <strong>${esc(name)}</strong>
              <small>${esc(item.credit)} · ${t('公共领域', 'public domain')}</small>
            </span>
            <span class="gallery-open">${icon('expand', 15)}</span>
          </button>`;
        }).join('')}
      </div>

      <div class="gallery-note">
        ${icon('info', 15)}
        <span>${t('图片来源：NASA Image and Video Library，按 NASA Media Usage Guidelines 使用。这里只保留画面，不标注具体机型。', 'Source: NASA Image and Video Library, used under the NASA Media Usage Guidelines. Pictures only; no specific aircraft type is labeled.')}</span>
      </div>
    </div>`;
    this.bind();
  }

  bind() {
    if (this.bound) return;
    this.bound = true;
    this.root.addEventListener('click', (event) => {
      const card = event.target.closest('[data-gallery-index]');
      if (!card) return;
      const item = GALLERY[Number(card.dataset.galleryIndex)];
      if (!item) return;
      const lang = getLanguage();
      const name = lang === 'en' ? item.titleEn : item.titleZh;
      openModal({
        title: name,
        subtitle: `${t('飞机图库', 'Aircraft gallery')} · NASA ${t('公共领域影像', 'public-domain image')}`,
        className: 'gallery-modal',
        body: `<div class="gallery-modal-photo"><img src="${item.photo}" alt="${esc(name)}" /></div>
          <div class="gallery-modal-caption">${icon('camera', 15)} ${esc(item.credit)} · ${t('NASA 公共领域', 'NASA public domain')}<span>${t('仅作视觉收藏，不标注具体机型或注册号。', 'Visual collection only; no specific type or registration is labeled.')} · ${esc(item.id)}</span></div>`,
      });
    });
  }
}

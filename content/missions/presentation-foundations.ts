// Bundled product proposal for educator review, completion never represents an assessed skill score.
export type LearningLocale = 'id' | 'en';
export type StageId = 'clear-idea' | 'clear-explanation';
export type LessonId = `${StageId}-${1 | 2 | 3 | 4}`;

export interface LessonCopy {
  title: string;
  goal: string;
  example: string;
  exampleNote: string;
  question: string;
  options: readonly [string, string, string];
  correctOption: 0 | 1 | 2;
  taskSuccess: string;
  taskHint: string;
  prompt: string;
  starter: string;
  selfCheck: string;
  retry: string;
  transfer: string;
}

export interface LearningLesson {
  id: LessonId;
  baseline?: boolean;
  locales: Record<LearningLocale, LessonCopy>;
}

export interface LearningStage {
  id: StageId;
  locales: Record<LearningLocale, { title: string; goal: string }>;
  lessons: readonly [LearningLesson, LearningLesson, LearningLesson, LearningLesson];
}

export const learningStages: readonly LearningStage[] = [
  {
    id: 'clear-idea',
    locales: {
      id: { title: 'Satu ide yang jelas', goal: 'Bantu pendengar mengenali pesan utamamu.' },
      en: { title: 'One clear idea', goal: 'Help a listener recognize your main message.' },
    },
    lessons: [
      {
        id: 'clear-idea-1',
        baseline: true,
        locales: {
          id: {
            title: 'Mulai dari idemu',
            goal: 'Sampaikan satu hal yang ingin kamu jelaskan.',
            example: 'Aku ingin menjelaskan cara merawat tanaman di kelas.',
            exampleNote: 'Pendengar tahu topiknya, yaitu merawat tanaman.',
            question: 'Apa yang ingin Morii jelaskan?',
            options: [
              'Merawat tanaman di kelas',
              'Bermain bola saat istirahat',
              'Memilih buku bacaan',
            ],
            correctOption: 0,
            taskSuccess: 'Ya, itu topik yang disebutkan Morii.',
            taskHint: 'Dengarkan kata setelah “menjelaskan”.',
            prompt:
              'Jelaskan satu kegiatan di sekolah yang kamu pahami. Mulai dengan caramu sendiri.',
            starter: '',
            selfCheck: 'Apakah kamu menyebutkan topik yang kamu jelaskan?',
            retry: 'Mulai dengan “Aku ingin menjelaskan …”, lalu sebutkan satu topik.',
            transfer: 'Coba sebutkan topik lain yang bisa kamu jelaskan kepada teman.',
          },
          en: {
            title: 'Start with your idea',
            goal: 'Name one thing you want to explain.',
            example: 'I want to explain how to care for our classroom plants.',
            exampleNote: 'A listener knows the topic, caring for classroom plants.',
            question: 'What does Morii want to explain?',
            options: [
              'Caring for classroom plants',
              'Playing football at break',
              'Choosing a book to read',
            ],
            correctOption: 0,
            taskSuccess: 'Yes, that is the topic Morii named.',
            taskHint: 'Listen for the words after “explain”.',
            prompt: 'Explain one school activity you know about. Start in your own way.',
            starter: '',
            selfCheck: 'Did you name the topic you explained?',
            retry: 'Start with “I want to explain …”, then name one topic.',
            transfer: 'Think of another topic you could explain to a friend.',
          },
        },
      },
      {
        id: 'clear-idea-2',
        locales: {
          id: {
            title: 'Temukan pesan utama',
            goal: 'Pilih satu pesan yang ingin diingat pendengar.',
            example: 'Membawa botol minum sendiri membantu kita mengurangi sampah plastik.',
            exampleNote: 'Pesan utamanya adalah manfaat membawa botol minum sendiri.',
            question: 'Kalimat mana yang menyampaikan pesan utama yang sama?',
            options: [
              'Botolku berwarna biru.',
              'Botol minum sendiri bisa mengurangi sampah plastik.',
              'Aku berangkat sekolah pagi.',
            ],
            correctOption: 1,
            taskSuccess: 'Kalimat itu menyampaikan manfaat yang sama.',
            taskHint: 'Cari kalimat yang menjelaskan manfaat, bukan warna botol.',
            prompt: 'Jelaskan satu manfaat menjaga kelas tetap bersih.',
            starter: 'Kelas yang bersih membantu kita …',
            selfCheck: 'Apakah ada satu manfaat yang jelas dalam kalimatmu?',
            retry: 'Pilih satu manfaat, lalu sampaikan dalam satu kalimat.',
            transfer: 'Sebutkan pesan utama tentang kebiasaan lain di sekolah.',
          },
          en: {
            title: 'Find the main message',
            goal: 'Choose one message you want a listener to remember.',
            example: 'Bringing a reusable water bottle helps us reduce plastic waste.',
            exampleNote: 'The main message is a benefit of bringing a reusable bottle.',
            question: 'Which sentence gives the same main message?',
            options: [
              'My bottle is blue.',
              'A reusable bottle can reduce plastic waste.',
              'I go to school early.',
            ],
            correctOption: 1,
            taskSuccess: 'That sentence shares the same benefit.',
            taskHint: 'Look for a benefit, rather than the color of the bottle.',
            prompt: 'Explain one benefit of keeping a classroom clean.',
            starter: 'A clean classroom helps us …',
            selfCheck: 'Does your sentence explain one clear benefit?',
            retry: 'Choose one benefit and explain it in one sentence.',
            transfer: 'Name a main message about another school habit.',
          },
        },
      },
      {
        id: 'clear-idea-3',
        locales: {
          id: {
            title: 'Katakan dengan jelas',
            goal: 'Sebutkan topik dan pesanmu tanpa kata yang membingungkan.',
            example: 'Menyimpan buku di rak membuat meja kita lebih rapi.',
            exampleNote: 'Morii menyebutkan buku, rak, dan manfaatnya.',
            question: 'Kalimat mana yang lebih mudah dipahami?',
            options: [
              'Itu membuat ini lebih begitu.',
              'Ya, yang tadi itu.',
              'Menyimpan buku di rak membuat meja lebih rapi.',
            ],
            correctOption: 2,
            taskSuccess: 'Topik dan manfaatnya disebutkan dengan jelas.',
            taskHint: 'Pilih kalimat yang menyebutkan bendanya dan manfaatnya.',
            prompt: 'Jelaskan bagaimana menyiapkan alat tulis bisa membantu saat belajar.',
            starter: 'Menyiapkan alat tulis membantu …',
            selfCheck: 'Apakah kamu menyebutkan alat tulis dan manfaatnya?',
            retry: 'Ganti kata “itu” atau “ini” dengan hal yang kamu maksud.',
            transfer: 'Coba jelaskan kebiasaan yang berguna dengan kata-katamu sendiri.',
          },
          en: {
            title: 'Say it clearly',
            goal: 'Name your topic and message with clear words.',
            example: 'Putting books on the shelf keeps our desks tidy.',
            exampleNote: 'Morii names the books, the shelf, and the benefit.',
            question: 'Which sentence is easier to understand?',
            options: [
              'That makes this more like that.',
              'Yes, the thing from before.',
              'Putting books on the shelf keeps desks tidy.',
            ],
            correctOption: 2,
            taskSuccess: 'The sentence clearly names the topic and its benefit.',
            taskHint: 'Choose the sentence that names the objects and the benefit.',
            prompt: 'Explain how preparing your pencils and pens can help you learn.',
            starter: 'Preparing my pencils and pens helps …',
            selfCheck: 'Did you name the pencils and pens and explain a benefit?',
            retry: 'Replace “that” or “this” with the thing you mean.',
            transfer: 'Explain another useful habit in your own words.',
          },
        },
      },
      {
        id: 'clear-idea-4',
        locales: {
          id: {
            title: 'Idemu, topik baru',
            goal: 'Sampaikan pesan utama tentang topik yang berbeda.',
            example: 'Membaca petunjuk sebelum bermain membantu kita memahami aturan.',
            exampleNote: 'Morii memilih satu manfaat, lalu menyampaikannya dengan jelas.',
            question: 'Apa yang sebaiknya dijelaskan lebih dulu?',
            options: [
              'Satu pesan tentang topikmu',
              'Semua hal yang terlintas sekaligus',
              'Warna sepatu pendengarmu',
            ],
            correctOption: 0,
            taskSuccess: 'Satu pesan memberi arah pada penjelasanmu.',
            taskHint: 'Mulai dengan pesan yang ingin diingat pendengar.',
            prompt:
              'Jelaskan satu manfaat mendengarkan teman saat mereka berbicara. Gunakan kata-katamu sendiri.',
            starter: '',
            selfCheck: 'Apakah pendengar bisa mengenali satu pesan utama dari penjelasanmu?',
            retry: 'Tentukan satu manfaat dulu, lalu coba sampaikan lebih langsung.',
            transfer: 'Jika kamu mau, sampaikan pesanmu kepada orang yang kamu percaya.',
          },
          en: {
            title: 'Your idea, a new topic',
            goal: 'Give a main message about a different topic.',
            example: 'Reading instructions before a game helps us understand the rules.',
            exampleNote: 'Morii chooses one benefit and states it clearly.',
            question: 'What is helpful to explain first?',
            options: [
              'One message about your topic',
              'Every thought all at once',
              'The color of your listener’s shoes',
            ],
            correctOption: 0,
            taskSuccess: 'One message gives your explanation a direction.',
            taskHint: 'Start with the message you want a listener to remember.',
            prompt: 'Explain one benefit of listening when a friend speaks. Use your own words.',
            starter: '',
            selfCheck: 'Could a listener recognize one main message in your explanation?',
            retry: 'Choose one benefit first, then try saying it more directly.',
            transfer: 'If you want, share your message with someone you trust.',
          },
        },
      },
    ],
  },
  {
    id: 'clear-explanation',
    locales: {
      id: { title: 'Penjelasan yang runtut', goal: 'Hubungkan ide, alasan, dan contoh.' },
      en: { title: 'An organized explanation', goal: 'Connect an idea, a reason, and an example.' },
    },
    lessons: [
      {
        id: 'clear-explanation-1',
        locales: {
          id: {
            title: 'Susun urutannya',
            goal: 'Jelaskan langkah-langkah dengan urutan yang mudah diikuti.',
            example:
              'Pertama, pilih buku. Lalu, baca beberapa halaman. Terakhir, ceritakan satu hal yang kamu pelajari.',
            exampleNote: 'Pertama, lalu, dan terakhir membantu pendengar mengikuti langkahnya.',
            question: 'Urutan mana yang mudah diikuti untuk membaca buku?',
            options: [
              'Ceritakan hasilnya → pilih buku → baca',
              'Pilih buku → baca → ceritakan hasilnya',
              'Baca → ceritakan hasilnya → pilih buku',
            ],
            correctOption: 1,
            taskSuccess: 'Ya, memilih buku dilakukan sebelum membaca dan menceritakan hasilnya.',
            taskHint: 'Apa yang perlu dilakukan sebelum mulai membaca?',
            prompt: 'Jelaskan tiga langkah menyiapkan tas sekolah.',
            starter: 'Pertama … Lalu … Terakhir …',
            selfCheck: 'Apakah langkahmu bisa diikuti dari awal sampai akhir?',
            retry: 'Pilih tiga langkah, lalu ucapkan dengan pertama, lalu, dan terakhir.',
            transfer: 'Coba jelaskan langkah kegiatan lain yang kamu pahami.',
          },
          en: {
            title: 'Put it in order',
            goal: 'Explain steps in an order a listener can follow.',
            example:
              'First, choose a book. Next, read a few pages. Finally, share one thing you learned.',
            exampleNote: 'First, next, and finally help a listener follow the steps.',
            question: 'Which order makes sense for reading a book?',
            options: [
              'Share what you learned → choose → read',
              'Choose a book → read → share what you learned',
              'Read → share what you learned → choose',
            ],
            correctOption: 1,
            taskSuccess: 'Yes, choosing comes before reading and sharing what you learned.',
            taskHint: 'What needs to happen before you start reading?',
            prompt: 'Explain three steps for packing your school bag.',
            starter: 'First … Next … Finally …',
            selfCheck: 'Could a listener follow your steps from start to finish?',
            retry: 'Choose three steps and use first, next, and finally.',
            transfer: 'Explain the steps of another activity you know about.',
          },
        },
      },
      {
        id: 'clear-explanation-2',
        locales: {
          id: {
            title: 'Tambahkan alasan',
            goal: 'Hubungkan idemu dengan alasan yang sesuai.',
            example:
              'Aku menyarankan membaca bersama karena kita bisa membahas bagian yang belum dipahami.',
            exampleNote: 'Alasannya menjelaskan manfaat membaca bersama.',
            question: 'Alasan mana yang mendukung ide membaca bersama?',
            options: [
              'Karena sepatu baruku nyaman.',
              'Karena langit berwarna biru.',
              'Karena kita bisa membahas bagian yang sulit.',
            ],
            correctOption: 2,
            taskSuccess: 'Alasan itu berhubungan langsung dengan membaca bersama.',
            taskHint: 'Cari alasan yang menjelaskan manfaat kegiatan tersebut.',
            prompt: 'Sarankan satu cara menjaga kelas rapi, lalu jelaskan alasannya.',
            starter: 'Aku menyarankan … karena …',
            selfCheck: 'Apakah alasanmu menjelaskan mengapa idemu berguna?',
            retry: 'Ucapkan idemu, lalu sambungkan alasan dengan kata “karena”.',
            transfer: 'Coba berikan alasan untuk saran lain kepada teman.',
          },
          en: {
            title: 'Add a reason',
            goal: 'Connect your idea to a relevant reason.',
            example:
              'I suggest reading together because we can discuss parts we do not understand.',
            exampleNote: 'The reason explains a benefit of reading together.',
            question: 'Which reason supports reading together?',
            options: [
              'Because my new shoes are comfortable.',
              'Because the sky is blue.',
              'Because we can discuss difficult parts.',
            ],
            correctOption: 2,
            taskSuccess: 'That reason connects directly to reading together.',
            taskHint: 'Look for a reason that explains a benefit of the activity.',
            prompt: 'Suggest one way to keep your classroom tidy and explain why.',
            starter: 'I suggest … because …',
            selfCheck: 'Does your reason explain why your idea is useful?',
            retry: 'Say your idea, then connect your reason with “because”.',
            transfer: 'Give a reason for another suggestion to a friend.',
          },
        },
      },
      {
        id: 'clear-explanation-3',
        locales: {
          id: {
            title: 'Buat contoh nyata',
            goal: 'Tambahkan contoh yang membantu pendengar membayangkan idemu.',
            example:
              'Membagi tugas membantu kelompok bekerja lebih teratur. Misalnya, satu teman mencari informasi dan satu teman menyiapkan gambar.',
            exampleNote: 'Contohnya menyebutkan dua tugas yang bisa dibagi.',
            question: 'Contoh mana yang mendukung ide membagi tugas?',
            options: [
              'Rani mencari informasi, Dika membuat gambar.',
              'Semua orang menunggu tanpa tugas.',
              'Aku makan roti saat istirahat.',
            ],
            correctOption: 0,
            taskSuccess: 'Contoh itu menunjukkan bagaimana tugas dibagi.',
            taskHint: 'Cari contoh yang menyebutkan siapa mengerjakan apa.',
            prompt: 'Jelaskan mengapa bekerja sama berguna, lalu berikan satu contoh.',
            starter: 'Bekerja sama membantu … Misalnya …',
            selfCheck: 'Apakah contohmu menunjukkan bagaimana kerja sama dilakukan?',
            retry: 'Tambahkan contoh dengan siapa yang membantu dan apa yang dilakukan.',
            transfer: 'Cari satu contoh yang sesuai untuk ide lain.',
          },
          en: {
            title: 'Make it concrete',
            goal: 'Add an example that helps a listener picture your idea.',
            example:
              'Sharing tasks helps a group stay organized. For example, one friend finds information and another prepares pictures.',
            exampleNote: 'The example names two tasks that can be shared.',
            question: 'Which example supports sharing tasks?',
            options: [
              'Rani finds information and Dika makes pictures.',
              'Everyone waits without a task.',
              'I eat bread at break.',
            ],
            correctOption: 0,
            taskSuccess: 'That example shows how tasks can be shared.',
            taskHint: 'Look for an example that says who does what.',
            prompt: 'Explain why working together is useful and give one example.',
            starter: 'Working together helps … For example …',
            selfCheck: 'Does your example show how people work together?',
            retry: 'Add an example naming who helps and what they do.',
            transfer: 'Find one relevant example for a different idea.',
          },
        },
      },
      {
        id: 'clear-explanation-4',
        locales: {
          id: {
            title: 'Hubungkan semuanya',
            goal: 'Jelaskan satu ide, alasan, dan contoh dengan runtut.',
            example:
              'Merawat tanaman kelas itu berguna karena kelas terasa nyaman. Misalnya, kita bisa bergantian memeriksa tanah dan menyiram saat diperlukan.',
            exampleNote: 'Morii menyebutkan ide, memberi alasan, lalu menambahkan contoh.',
            question: 'Susunan mana yang membantu pendengar mengikuti penjelasan?',
            options: [
              'Contoh acak → ganti topik → alasan lain',
              'Ide → alasan yang sesuai → contoh',
              'Alasan → ganti topik → berhenti',
            ],
            correctOption: 1,
            taskSuccess: 'Susunan itu menghubungkan pesanmu dengan alasan dan contoh.',
            taskHint: 'Mulai dengan pesanmu, lalu jelaskan mengapa dan beri contoh.',
            prompt:
              'Jelaskan satu cara membuat kegiatan kelompok lebih baik. Berikan alasan dan contoh dengan kata-katamu sendiri.',
            starter: '',
            selfCheck: 'Apakah kamu menyampaikan satu ide, alasan yang sesuai, dan contoh?',
            retry: 'Pikirkan tiga kata kunci: ide, alasan, contoh. Lalu coba lagi.',
            transfer:
              'Jika kamu mau, jelaskan idemu kepada orang yang kamu percaya dan tanyakan pesan apa yang mereka ingat.',
          },
          en: {
            title: 'Connect it all',
            goal: 'Give one idea, a reason, and an example in a clear order.',
            example:
              'Caring for classroom plants is useful because it makes the room pleasant. For example, we can take turns checking the soil and watering when needed.',
            exampleNote: 'Morii names an idea, gives a reason, and adds an example.',
            question: 'Which order helps a listener follow an explanation?',
            options: [
              'Random example → change topic → another reason',
              'Idea → relevant reason → example',
              'Reason → change topic → stop',
            ],
            correctOption: 1,
            taskSuccess: 'That order connects your message to a reason and an example.',
            taskHint: 'Start with your message, explain why, and give an example.',
            prompt:
              'Explain one way to make a group activity better. Give a reason and an example in your own words.',
            starter: '',
            selfCheck: 'Did you give one idea, a relevant reason, and an example?',
            retry: 'Think of three key words: idea, reason, example. Then try again.',
            transfer:
              'If you want, explain your idea to someone you trust and ask which message they remember.',
          },
        },
      },
    ],
  },
];

export const learningLessons = learningStages.flatMap((stage) => stage.lessons);

export function findLesson(id: string): LearningLesson | undefined {
  return learningLessons.find((lesson) => lesson.id === id);
}

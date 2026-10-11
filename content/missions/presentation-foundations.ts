import type { LearningLesson, LearningStage } from './learning-types.ts';
import { listenerAwarenessStage } from './listener-awareness.ts';
import { presentationPracticeStage } from './presentation-practice.ts';

export type {
  ChoiceExercise,
  SequenceExercise,
  LessonExercise,
  SpeakingPractice,
  LearningLesson,
  LearningLocale,
  LearningStage,
  LessonCopy,
  LessonId,
  StageId,
} from './learning-types.ts';

// Bundled curriculum proposal for educator review, existing lesson IDs remain stable.
export const learningStages: readonly LearningStage[] = [
  {
    id: 'clear-idea',
    locales: {
      id: {
        title: 'Menjelaskan ide',
        goal: 'Bantu pendengar mengenali pesan utamamu.',
      },
      en: {
        title: 'Explaining an idea',
        goal: 'Help a listener recognize your main message.',
      },
    },
    lessons: [
      {
        id: 'clear-idea-1',
        baseline: true,
        locales: {
          id: {
            title: 'Menentukan topik',
            goal: 'Sampaikan satu hal yang ingin kamu jelaskan.',
            example: 'Saya akan menjelaskan cara merawat tanaman di kelas.',
            exampleNote: 'Pendengar tahu topiknya, yaitu merawat tanaman.',
            retry: 'Mulai dengan “Saya akan menjelaskan …”, lalu sebutkan satu topik.',
            transfer: 'Coba sebutkan topik lain yang bisa kamu jelaskan kepada teman.',
            exercise: {
              kind: 'choice',
              question: 'Apa yang ingin Morii jelaskan?',
              options: [
                'Merawat tanaman di kelas',
                'Bermain bola saat istirahat',
                'Memilih buku bacaan',
              ],
              correctOption: 0,
              success: 'Ya, itu topik yang disebutkan Morii.',
              hint: 'Dengarkan kata setelah “menjelaskan”.',
            },
            practices: [
              {
                prompt:
                  'Kamu akan menjelaskan cara merawat tanaman di kelas. Sebutkan topik itu dalam satu kalimat pembuka.',
                starter: 'Saya akan menjelaskan …',
                selfCheck: 'Apakah kamu menyebutkan topik merawat tanaman di kelas?',
              },
              {
                prompt:
                  'Kamu akan menjelaskan aturan satu permainan yang kamu kenal. Sebutkan nama permainan itu dalam satu kalimat pembuka.',
                starter: 'nama permainan → hal yang akan dijelaskan',
                selfCheck: 'Apakah kamu menyebutkan permainan yang akan kamu jelaskan?',
              },
            ],
          },
          en: {
            title: 'Choosing a topic',
            goal: 'Name one thing you want to explain.',
            example: 'I want to explain how to care for our classroom plants.',
            exampleNote: 'A listener knows the topic, caring for classroom plants.',
            retry: 'Start with “I want to explain …”, then name one topic.',
            transfer: 'Think of another topic you could explain to a friend.',
            exercise: {
              kind: 'choice',
              question: 'What does Morii want to explain?',
              options: [
                'Caring for classroom plants',
                'Playing football at break',
                'Choosing a book to read',
              ],
              correctOption: 0,
              success: 'Yes, that is the topic Morii named.',
              hint: 'Listen for the words after “explain”.',
            },
            practices: [
              {
                prompt:
                  'You will explain how to care for classroom plants. Name that topic in one opening sentence.',
                starter: 'I will explain …',
                selfCheck: 'Did you name the topic of caring for classroom plants?',
              },
              {
                prompt:
                  'You will explain the rules of a game you know. Name the game in one opening sentence.',
                starter: 'name of the game → what you will explain',
                selfCheck: 'Did you name the game you will explain?',
              },
            ],
          },
        },
      },
      {
        id: 'clear-idea-2',
        locales: {
          id: {
            title: 'Menyampaikan pesan utama',
            goal: 'Pilih satu pesan yang ingin diingat pendengar.',
            example: 'Membawa botol minum sendiri membantu kita mengurangi sampah plastik.',
            exampleNote: 'Pesan utamanya adalah manfaat membawa botol minum sendiri.',
            retry: 'Pilih satu manfaat, lalu sampaikan dalam satu kalimat.',
            transfer: 'Sebutkan pesan utama tentang kebiasaan lain di sekolah.',
            exercise: {
              kind: 'choice',
              question: 'Kalimat mana yang menyampaikan pesan utama yang sama?',
              options: [
                'Botolku berwarna biru.',
                'Botol minum sendiri bisa mengurangi sampah plastik.',
                'Aku berangkat sekolah pagi.',
              ],
              correctOption: 1,
              success: 'Kalimat itu menyampaikan manfaat yang sama.',
              hint: 'Cari kalimat yang menjelaskan manfaat, bukan warna botol.',
            },
            practices: [
              {
                prompt:
                  'Jelaskan satu manfaat menjaga kelas tetap bersih. Cukup satu atau dua kalimat.',
                starter: 'Kelas yang bersih membantu kita …',
                selfCheck: 'Apakah kamu menyampaikan satu manfaat kelas yang bersih?',
              },
              {
                prompt:
                  'Jelaskan satu manfaat mengembalikan buku ke rak setelah membaca. Cukup satu atau dua kalimat.',
                starter: 'Mengembalikan buku ke rak membantu …',
                selfCheck: 'Apakah kamu menyampaikan satu manfaat mengembalikan buku ke rak?',
              },
            ],
          },
          en: {
            title: 'Stating the main message',
            goal: 'Choose one message you want a listener to remember.',
            example: 'Bringing a reusable water bottle helps us reduce plastic waste.',
            exampleNote: 'The main message is a benefit of bringing a reusable bottle.',
            retry: 'Choose one benefit and explain it in one sentence.',
            transfer: 'Name a main message about another school habit.',
            exercise: {
              kind: 'choice',
              question: 'Which sentence gives the same main message?',
              options: [
                'My bottle is blue.',
                'A reusable bottle can reduce plastic waste.',
                'I go to school early.',
              ],
              correctOption: 1,
              success: 'That sentence shares the same benefit.',
              hint: 'Look for a benefit, rather than the color of the bottle.',
            },
            practices: [
              {
                prompt:
                  'Explain one benefit of keeping the classroom clean. Use one or two sentences.',
                starter: 'A clean classroom helps us …',
                selfCheck: 'Did you state one benefit of a clean classroom?',
              },
              {
                prompt:
                  'Explain one benefit of returning books to the shelf after reading. Use one or two sentences.',
                starter: 'Returning books to the shelf helps …',
                selfCheck: 'Did you state one benefit of returning books to the shelf?',
              },
            ],
          },
        },
      },
      {
        id: 'clear-idea-3',
        locales: {
          id: {
            title: 'Menggunakan kata yang jelas',
            goal: 'Sebutkan topik dan pesanmu tanpa kata yang membingungkan.',
            example: 'Menyimpan buku di rak membuat meja kita lebih rapi.',
            exampleNote: 'Morii menyebutkan buku, rak, dan manfaatnya.',
            retry: 'Ganti kata “itu” atau “ini” dengan hal yang kamu maksud.',
            transfer: 'Coba jelaskan kebiasaan yang berguna dengan kata-katamu sendiri.',
            exercise: {
              kind: 'speak',
            },
            practices: [
              {
                prompt:
                  'Ubah kalimat ini agar jelas: “Taruh itu di sana.” Maksudmu, pensil perlu disimpan di tempat pensil. Ucapkan kalimat yang lengkap.',
                starter: 'pensil → tempat pensil',
                selfCheck: 'Apakah kamu menyebutkan pensil dan tempat pensil dengan jelas?',
              },
              {
                prompt:
                  'Ubah kalimat ini agar jelas: “Kembalikan yang tadi.” Maksudmu, buku cerita perlu dikembalikan ke rak. Ucapkan kalimat yang lengkap.',
                starter: 'buku cerita → rak',
                selfCheck: 'Apakah kamu menyebutkan buku cerita dan tempat menyimpannya?',
              },
            ],
          },
          en: {
            title: 'Using clear words',
            goal: 'Name your topic and message with clear words.',
            example: 'Putting books on the shelf keeps our desks tidy.',
            exampleNote: 'Morii names the books, the shelf, and the benefit.',
            retry: 'Replace “that” or “this” with the thing you mean.',
            transfer: 'Explain another useful habit in your own words.',
            exercise: {
              kind: 'speak',
            },
            practices: [
              {
                prompt:
                  'Make this sentence clear: “Put that over there.” You mean the pencil belongs in the pencil case. Say a complete sentence.',
                starter: 'pencil → pencil case',
                selfCheck: 'Did you clearly name the pencil and the pencil case?',
              },
              {
                prompt:
                  'Make this sentence clear: “Return the thing from before.” You mean the storybook belongs on the shelf. Say a complete sentence.',
                starter: 'storybook → shelf',
                selfCheck: 'Did you name the storybook and where to put it?',
              },
            ],
          },
        },
      },
      {
        id: 'clear-idea-4',
        locales: {
          id: {
            title: 'Menjelaskan topik lain',
            goal: 'Sampaikan pesan utama tentang topik yang berbeda.',
            example: 'Membaca petunjuk sebelum bermain membantu kita memahami aturan.',
            exampleNote: 'Morii memilih satu manfaat, lalu menyampaikannya dengan jelas.',
            retry: 'Tentukan satu manfaat dulu, lalu coba sampaikan lebih langsung.',
            transfer: 'Jika kamu mau, sampaikan pesanmu kepada orang yang kamu percaya.',
            exercise: {
              kind: 'speak',
            },
            practices: [
              {
                prompt:
                  'Jelaskan satu manfaat membaca petunjuk sebelum bermain. Gunakan satu atau dua kalimat dengan kata-katamu sendiri.',
                starter: '',
                selfCheck: 'Apakah kamu menyampaikan satu manfaat membaca petunjuk?',
              },
              {
                prompt:
                  'Jelaskan satu manfaat menyiapkan tas pada malam hari. Gunakan satu atau dua kalimat dengan kata-katamu sendiri.',
                starter: '',
                selfCheck: 'Apakah kamu menyampaikan satu manfaat menyiapkan tas lebih awal?',
              },
            ],
          },
          en: {
            title: 'Explaining another topic',
            goal: 'Give a main message about a different topic.',
            example: 'Reading instructions before a game helps us understand the rules.',
            exampleNote: 'Morii chooses one benefit and states it clearly.',
            retry: 'Choose one benefit first, then try saying it more directly.',
            transfer: 'If you want, share your message with someone you trust.',
            exercise: {
              kind: 'speak',
            },
            practices: [
              {
                prompt:
                  'Explain one benefit of reading instructions before playing. Use one or two sentences in your own words.',
                starter: '',
                selfCheck: 'Did you state one benefit of reading the instructions?',
              },
              {
                prompt:
                  'Explain one benefit of packing your school bag the night before. Use one or two sentences in your own words.',
                starter: '',
                selfCheck: 'Did you state one benefit of packing your bag in advance?',
              },
            ],
          },
        },
      },
    ],
  },
  {
    id: 'clear-explanation',
    locales: {
      id: {
        title: 'Menyusun penjelasan',
        goal: 'Hubungkan ide, alasan, dan contoh.',
      },
      en: {
        title: 'Organizing an explanation',
        goal: 'Connect an idea, a reason, and an example.',
      },
    },
    lessons: [
      {
        id: 'clear-explanation-1',
        locales: {
          id: {
            title: 'Menjelaskan urutan',
            goal: 'Jelaskan langkah-langkah dengan urutan yang mudah diikuti.',
            example:
              'Pertama, pilih buku. Lalu, baca beberapa halaman. Terakhir, ceritakan satu hal yang kamu pelajari.',
            exampleNote: 'Pertama, lalu, dan terakhir membantu pendengar mengikuti langkahnya.',
            retry: 'Pilih tiga langkah, lalu ucapkan dengan pertama, lalu, dan terakhir.',
            transfer: 'Coba jelaskan langkah kegiatan lain yang kamu pahami.',
            exercise: {
              kind: 'sequence',
              question: 'Susun kalimat sesuai urutan penjelasan.',
              items: [
                'Pertama, pilih buku.',
                'Lalu, baca beberapa halaman.',
                'Terakhir, ceritakan satu hal yang kamu pelajari.',
              ],
              success: 'Urutannya sudah sesuai: memilih buku, membaca, lalu menjelaskan hasilnya.',
              hint: 'Mulai dari memilih buku. Jelaskan hasilnya setelah membaca.',
            },
            practices: [
              {
                prompt:
                  'Jelaskan tiga langkah menyiapkan tas sekolah: periksa jadwal, pilih buku, lalu masukkan buku ke tas.',
                starter: 'Pertama … Lalu … Terakhir …',
                selfCheck:
                  'Apakah kamu menjelaskan langkahnya dari memeriksa jadwal sampai memasukkan buku?',
              },
              {
                prompt:
                  'Jelaskan tiga langkah menyiapkan meja belajar: simpan barang yang tidak diperlukan, letakkan buku, lalu siapkan alat tulis.',
                starter: 'Pertama … Lalu … Terakhir …',
                selfCheck: 'Apakah langkahmu bisa diikuti dari awal sampai akhir?',
              },
            ],
          },
          en: {
            title: 'Explaining steps in order',
            goal: 'Explain steps in an order a listener can follow.',
            example:
              'First, choose a book. Next, read a few pages. Finally, share one thing you learned.',
            exampleNote: 'First, next, and finally help a listener follow the steps.',
            retry: 'Choose three steps and use first, next, and finally.',
            transfer: 'Explain the steps of another activity you know about.',
            exercise: {
              kind: 'sequence',
              question: 'Put the sentences in the order of the explanation.',
              items: [
                'First, choose a book.',
                'Next, read a few pages.',
                'Finally, share one thing you learned.',
              ],
              success: 'The order fits: choose a book, read, then share what you learned.',
              hint: 'Choose a book first. Share what you learned after reading.',
            },
            practices: [
              {
                prompt:
                  'Explain three steps for packing a school bag: check the timetable, choose the books, then put the books in the bag.',
                starter: 'First … Next … Finally …',
                selfCheck:
                  'Did you explain the steps from checking the timetable to packing the books?',
              },
              {
                prompt:
                  'Explain three steps for preparing a desk: put away unneeded items, place your book, then prepare your pencils and pens.',
                starter: 'First … Next … Finally …',
                selfCheck: 'Could a listener follow your steps from start to finish?',
              },
            ],
          },
        },
      },
      {
        id: 'clear-explanation-2',
        locales: {
          id: {
            title: 'Memberikan alasan',
            goal: 'Hubungkan idemu dengan alasan yang sesuai.',
            example:
              'Saya menyarankan membaca bersama karena kita bisa membahas bagian yang belum dipahami.',
            exampleNote: 'Alasannya menjelaskan manfaat membaca bersama.',
            retry: 'Ucapkan idemu, lalu sambungkan alasan dengan kata “karena”.',
            transfer: 'Coba berikan alasan untuk saran lain kepada teman.',
            exercise: {
              kind: 'speak',
            },
            practices: [
              {
                prompt:
                  'Sarankan agar alat tulis disiapkan sebelum pelajaran dimulai. Jelaskan satu alasan yang berhubungan dengan saran itu.',
                starter: 'Saya menyarankan … karena …',
                selfCheck: 'Apakah alasanmu menjelaskan manfaat menyiapkan alat tulis?',
              },
              {
                prompt:
                  'Sarankan agar setiap anggota kelompok mendapat tugas. Jelaskan satu alasan yang berhubungan dengan saran itu.',
                starter: 'saran → alasan',
                selfCheck: 'Apakah alasanmu menjelaskan manfaat membagi tugas?',
              },
            ],
          },
          en: {
            title: 'Giving a reason',
            goal: 'Connect your idea to a relevant reason.',
            example:
              'I suggest reading together because we can discuss parts we do not understand.',
            exampleNote: 'The reason explains a benefit of reading together.',
            retry: 'Say your idea, then connect your reason with “because”.',
            transfer: 'Give a reason for another suggestion to a friend.',
            exercise: {
              kind: 'speak',
            },
            practices: [
              {
                prompt:
                  'Suggest preparing pencils and pens before a lesson starts. Give one reason related to that suggestion.',
                starter: 'I suggest … because …',
                selfCheck: 'Does your reason explain a benefit of preparing pencils and pens?',
              },
              {
                prompt:
                  'Suggest giving each group member a task. Give one reason related to that suggestion.',
                starter: 'suggestion → reason',
                selfCheck: 'Does your reason explain a benefit of sharing tasks?',
              },
            ],
          },
        },
      },
      {
        id: 'clear-explanation-3',
        locales: {
          id: {
            title: 'Memberikan contoh',
            goal: 'Tambahkan contoh yang membantu pendengar membayangkan idemu.',
            example:
              'Membagi tugas membantu kelompok bekerja lebih teratur. Misalnya, satu teman mencari informasi dan satu teman menyiapkan gambar.',
            exampleNote: 'Contohnya menyebutkan dua tugas yang bisa dibagi.',
            retry: 'Tambahkan contoh dengan siapa yang membantu dan apa yang dilakukan.',
            transfer: 'Cari satu contoh yang sesuai untuk ide lain.',
            exercise: {
              kind: 'choice',
              question: 'Contoh mana yang mendukung ide membagi tugas?',
              options: [
                'Rani mencari informasi, Dika membuat gambar.',
                'Semua orang menunggu tanpa tugas.',
                'Aku makan roti saat istirahat.',
              ],
              correctOption: 0,
              success: 'Contoh itu menunjukkan bagaimana tugas dibagi.',
              hint: 'Cari contoh yang menyebutkan siapa mengerjakan apa.',
            },
            practices: [
              {
                prompt:
                  'Jelaskan cara membagi tugas saat membuat poster kelompok. Berikan contoh dua anggota yang mengerjakan tugas berbeda.',
                starter: 'Satu anggota … Anggota lain …',
                selfCheck: 'Apakah contohmu menyebutkan dua tugas yang berbeda?',
              },
              {
                prompt:
                  'Jelaskan cara bekerja sama saat merapikan kelas. Berikan contoh dua anggota yang mengerjakan tugas berbeda.',
                starter: 'Satu anggota … Anggota lain …',
                selfCheck: 'Apakah contohmu menunjukkan pembagian tugas saat merapikan kelas?',
              },
            ],
          },
          en: {
            title: 'Giving an example',
            goal: 'Add an example that helps a listener picture your idea.',
            example:
              'Sharing tasks helps a group stay organized. For example, one friend finds information and another prepares pictures.',
            exampleNote: 'The example names two tasks that can be shared.',
            retry: 'Add an example naming who helps and what they do.',
            transfer: 'Find one relevant example for a different idea.',
            exercise: {
              kind: 'choice',
              question: 'Which example supports sharing tasks?',
              options: [
                'Rani finds information and Dika makes pictures.',
                'Everyone waits without a task.',
                'I eat bread at break.',
              ],
              correctOption: 0,
              success: 'That example shows how tasks can be shared.',
              hint: 'Look for an example that says who does what.',
            },
            practices: [
              {
                prompt:
                  'Explain how to share tasks when making a group poster. Give an example of two members doing different tasks.',
                starter: 'One member … Another member …',
                selfCheck: 'Did your example name two different tasks?',
              },
              {
                prompt:
                  'Explain how to work together when tidying a classroom. Give an example of two members doing different tasks.',
                starter: 'One member … Another member …',
                selfCheck: 'Does your example show how to share classroom tidying tasks?',
              },
            ],
          },
        },
      },
      {
        id: 'clear-explanation-4',
        locales: {
          id: {
            title: 'Menyusun penjelasan',
            goal: 'Jelaskan satu ide, alasan, dan contoh dengan runtut.',
            example:
              'Merawat tanaman kelas bermanfaat. Tanaman yang dirawat membuat kelas terasa nyaman. Misalnya, kita bisa bergantian memeriksa tanah dan menyiram saat diperlukan.',
            exampleNote: 'Morii menyebutkan ide, memberi alasan, lalu menambahkan contoh.',
            retry: 'Pikirkan tiga kata kunci: ide, alasan, contoh. Lalu coba lagi.',
            transfer:
              'Jika kamu mau, jelaskan idemu kepada orang yang kamu percaya dan tanyakan pesan apa yang mereka ingat.',
            exercise: {
              kind: 'sequence',
              question: 'Susun kalimat sesuai urutan penjelasan.',
              items: [
                'Merawat tanaman kelas bermanfaat.',
                'Tanaman yang dirawat membuat kelas terasa nyaman.',
                'Misalnya, kita bisa bergantian memeriksa tanah dan menyiram saat diperlukan.',
              ],
              success: 'Urutannya sudah sesuai: ide, alasan, lalu contoh.',
              hint: 'Mulai dari ide, jelaskan alasannya, lalu berikan contoh.',
            },
            practices: [
              {
                prompt:
                  'Jelaskan manfaat merawat tanaman di kelas. Sampaikan satu ide, alasan, dan contoh tindakan yang bisa dilakukan.',
                starter: 'ide → alasan → contoh',
                selfCheck: 'Apakah alasan dan contohmu mendukung ide merawat tanaman?',
              },
              {
                prompt:
                  'Jelaskan manfaat memberi tugas kepada setiap anggota kelompok. Sampaikan satu ide, alasan, dan contoh dengan kata-katamu sendiri.',
                starter: '',
                selfCheck: 'Apakah alasan dan contohmu mendukung ide pembagian tugas?',
              },
            ],
          },
          en: {
            title: 'Organizing an explanation',
            goal: 'Give one idea, a reason, and an example in a clear order.',
            example:
              'Caring for classroom plants is useful. Well-kept plants make the classroom feel pleasant. For example, we can take turns checking the soil and watering when needed.',
            exampleNote: 'Morii names an idea, gives a reason, and adds an example.',
            retry: 'Think of three key words: idea, reason, example. Then try again.',
            transfer:
              'If you want, explain your idea to someone you trust and ask which message they remember.',
            exercise: {
              kind: 'sequence',
              question: 'Put the sentences in the order of the explanation.',
              items: [
                'Caring for classroom plants is useful.',
                'Well-kept plants make the classroom feel pleasant.',
                'For example, we can take turns checking the soil and watering when needed.',
              ],
              success: 'The order fits: idea, reason, then example.',
              hint: 'Start with the idea, explain the reason, then give an example.',
            },
            practices: [
              {
                prompt:
                  'Explain a benefit of caring for classroom plants. Give one idea, a reason, and an example of an action to take.',
                starter: 'idea → reason → example',
                selfCheck: 'Do your reason and example support caring for classroom plants?',
              },
              {
                prompt:
                  'Explain a benefit of giving every group member a task. Give one idea, a reason, and an example in your own words.',
                starter: '',
                selfCheck: 'Do your reason and example support sharing tasks?',
              },
            ],
          },
        },
      },
    ],
  },
  listenerAwarenessStage,
  presentationPracticeStage,
];

export const learningLessons: readonly LearningLesson[] = learningStages.flatMap(
  (stage) => stage.lessons,
);

export function findLesson(id: string): LearningLesson | undefined {
  return learningLessons.find((lesson) => lesson.id === id);
}

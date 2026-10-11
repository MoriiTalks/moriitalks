import type { LearningStage } from './learning-types.ts';

// Model, rehearse, and reflect before independent practice, completion remains self-reported.
export const presentationPracticeStage: LearningStage = {
  id: 'presentation-practice',
  locales: {
    id: {
      title: 'Presentasi singkat',
      goal: 'Susun presentasi dan berlatih menjawab pertanyaan.',
    },
    en: {
      title: 'Short presentations',
      goal: 'Organize a presentation and practice answering questions.',
    },
  },
  lessons: [
    {
      id: 'presentation-practice-1',
      locales: {
        id: {
          title: 'Membuka dan menutup presentasi',
          goal: 'Sebutkan topik di awal dan rangkum kembali di akhir.',
          example:
            'Saya akan menjelaskan cara merapikan pojok baca. Setelah membaca, kembalikan buku ke rak sesuai tempatnya. Dengan begitu, buku tersimpan rapi dan mudah dicari.',
          exampleNote:
            'Pembukaan menyebutkan topik. Penjelasan membahas langkahnya. Penutup merangkum hasilnya.',
          exercise: {
            kind: 'sequence',
            question: 'Susun bagian presentasi dari pembukaan sampai penutup.',
            items: [
              'Saya akan menjelaskan cara merapikan pojok baca.',
              'Setelah membaca, kembalikan buku ke rak sesuai tempatnya.',
              'Dengan begitu, buku tersimpan rapi dan mudah dicari.',
            ],
            success: 'Urutannya sudah sesuai: pembukaan, penjelasan, lalu penutup.',
            hint: 'Mulai dari topik, lanjutkan dengan langkahnya, lalu rangkum hasilnya.',
          },
          practices: [
            {
              prompt:
                'Jelaskan kepada teman sekelas cara menyiapkan meja sebelum belajar. Sebutkan topiknya, jelaskan satu langkah, lalu buat penutup.',
              starter: 'topik → langkah → penutup',
              selfCheck: 'Apakah pembukaan dan penutupmu membahas cara menyiapkan meja?',
            },
            {
              prompt:
                'Tunjukkan sebuah gambar buatanmu kepada teman sekelas. Sebutkan gambar apa itu, jelaskan satu bagiannya, lalu buat penutup.',
              starter: 'gambar → bagian yang dijelaskan → penutup',
              selfCheck: 'Apakah pembukaan dan penutupmu membahas gambar yang sama?',
            },
          ],
          retry: 'Sebutkan topik di awal. Akhiri dengan rangkuman tentang topik yang sama.',
          transfer:
            'Jika mau, jelaskan gambar atau langkah tersebut kepada orang yang kamu percaya.',
        },
        en: {
          title: 'Opening and closing a presentation',
          goal: 'Name your topic at the start and summarize it at the end.',
          example:
            'I will explain how to tidy the reading corner. After reading, return each book to its place on the shelf. This keeps the books tidy and easy to find.',
          exampleNote:
            'The opening names the topic. The explanation gives a step. The closing summarizes the result.',
          exercise: {
            kind: 'sequence',
            question: 'Put the presentation parts in order, from opening to closing.',
            items: [
              'I will explain how to tidy the reading corner.',
              'After reading, return each book to its place on the shelf.',
              'This keeps the books tidy and easy to find.',
            ],
            success: 'The order fits: opening, explanation, then closing.',
            hint: 'Start with the topic, explain the step, then summarize the result.',
          },
          practices: [
            {
              prompt:
                'Explain to a classmate how to prepare a desk for learning. Name the topic, explain one step, then give a closing.',
              starter: 'topic → step → closing',
              selfCheck: 'Do your opening and closing both describe preparing the desk?',
            },
            {
              prompt:
                'Show a classmate a drawing you made. Say what it shows, explain one part, then give a closing.',
              starter: 'drawing → part to explain → closing',
              selfCheck: 'Do your opening and closing describe the same drawing?',
            },
          ],
          retry: 'Name your topic at the start. End with a summary of the same topic.',
          transfer: 'If you want, explain the drawing or those steps to someone you trust.',
        },
      },
    },
    {
      id: 'presentation-practice-2',
      locales: {
        id: {
          title: 'Menyusun presentasi',
          goal: 'Sampaikan pesan, alasan, contoh, dan penutup secara berurutan.',
          example:
            'Saya menyarankan kita menyiapkan alat tulis sebelum belajar. Alat tulis yang siap membantu kita langsung mulai bekerja. Misalnya, letakkan pensil dan penghapus di meja sebelum pelajaran dimulai. Jadi, siapkan alat tulis sebelum belajar.',
          exampleNote: 'Pesan, alasan, contoh, dan penutup membahas satu saran yang sama.',
          exercise: {
            kind: 'sequence',
            question: 'Susun pesan, alasan, contoh, dan penutupnya.',
            items: [
              'Saya menyarankan kita menyiapkan alat tulis sebelum belajar.',
              'Alat tulis yang siap membantu kita langsung mulai bekerja.',
              'Misalnya, letakkan pensil dan penghapus di meja sebelum pelajaran dimulai.',
              'Jadi, siapkan alat tulis sebelum belajar.',
            ],
            success: 'Setiap bagian mendukung saran untuk menyiapkan alat tulis.',
            hint: 'Sebutkan saran dahulu, lalu alasan, contoh, dan rangkuman sarannya.',
          },
          practices: [
            {
              prompt:
                'Sarankan kepada teman sekelas agar buku dikembalikan ke rak setelah dibaca. Sampaikan saran, alasan, contoh, dan penutup.',
              starter: 'saran → alasan → contoh → penutup',
              selfCheck: 'Apakah alasan dan contohmu mendukung saran tentang mengembalikan buku?',
            },
            {
              prompt:
                'Sarankan kepada teman sekelas agar petunjuk permainan dibaca sebelum bermain. Sampaikan saran, alasan, contoh, dan penutup.',
              starter: 'saran → alasan → contoh → penutup',
              selfCheck: 'Apakah alasan dan contohmu mendukung saran tentang membaca petunjuk?',
            },
          ],
          retry: 'Pilih satu saran. Hubungkan alasan, contoh, dan penutup dengan saran itu.',
          transfer: 'Jika mau, sampaikan satu saran tersebut kepada orang yang kamu percaya.',
        },
        en: {
          title: 'Organizing a presentation',
          goal: 'Give a message, reason, example, and closing in order.',
          example:
            'I suggest preparing our pencils and pens before learning. Having them ready helps us start our work right away. For example, put a pencil and an eraser on the desk before the lesson starts. So, prepare your pencils and pens before learning.',
          exampleNote: 'The message, reason, example, and closing support the same suggestion.',
          exercise: {
            kind: 'sequence',
            question: 'Put the message, reason, example, and closing in order.',
            items: [
              'I suggest preparing our pencils and pens before learning.',
              'Having them ready helps us start our work right away.',
              'For example, put a pencil and an eraser on the desk before the lesson starts.',
              'So, prepare your pencils and pens before learning.',
            ],
            success: 'Each part supports preparing our pencils and pens.',
            hint: 'Start with the suggestion, then its reason, example, and summary.',
          },
          practices: [
            {
              prompt:
                'Suggest to a classmate that books should be returned to the shelf after reading. Give a suggestion, reason, example, and closing.',
              starter: 'suggestion → reason → example → closing',
              selfCheck: 'Do your reason and example support returning books to the shelf?',
            },
            {
              prompt:
                'Suggest to a classmate that game instructions should be read before playing. Give a suggestion, reason, example, and closing.',
              starter: 'suggestion → reason → example → closing',
              selfCheck: 'Do your reason and example support reading the instructions?',
            },
          ],
          retry: 'Choose one suggestion. Connect your reason, example, and closing to it.',
          transfer: 'If you want, share one of those suggestions with someone you trust.',
        },
      },
    },
    {
      id: 'presentation-practice-3',
      locales: {
        id: {
          title: 'Menjawab saat belum tahu',
          goal: 'Katakan jika belum tahu dan jelaskan cara mencari jawabannya.',
          example:
            '“Berapa buku di rak kelas?” “Aku belum tahu jumlahnya. Aku perlu menghitung bukunya dulu.”',
          exampleNote: 'Jawaban itu menyebutkan hal yang belum diketahui dan cara memeriksanya.',
          exercise: { kind: 'speak' },
          practices: [
            {
              prompt:
                'Morii bertanya, “Berapa buku di rak kelas?” Kamu belum menghitungnya. Jawab tanpa menebak dan jelaskan cara mencari jumlahnya.',
              starter: 'belum tahu → hitung buku',
              selfCheck: 'Apakah kamu mengatakan belum tahu jumlahnya dan perlu menghitung buku?',
            },
            {
              prompt:
                'Morii bertanya, “Kapan kegiatan menggambar kelas dimulai?” Kamu belum melihat jadwalnya. Jawab tanpa menebak dan jelaskan cara mencari waktunya.',
              starter: 'belum tahu → periksa jadwal',
              selfCheck: 'Apakah kamu mengatakan belum tahu waktunya dan perlu memeriksa jadwal?',
            },
          ],
          retry: 'Katakan hal yang belum kamu ketahui, lalu sebutkan satu cara memeriksanya.',
          transfer: 'Jika mau, latih jawaban untuk pertanyaan lain yang belum kamu ketahui.',
        },
        en: {
          title: 'Answering when you do not know',
          goal: 'Say when you do not know and explain how to find the answer.',
          example:
            '“How many books are on the classroom shelf?” “I don’t know the number yet. I need to count the books first.”',
          exampleNote: 'The reply says what is not known yet and how to check it.',
          exercise: { kind: 'speak' },
          practices: [
            {
              prompt:
                'Morii asks, “How many books are on the classroom shelf?” You have not counted them. Answer without guessing and explain how to find the number.',
              starter: 'do not know yet → count the books',
              selfCheck: 'Did you say you do not know the number yet and need to count the books?',
            },
            {
              prompt:
                'Morii asks, “When does the class drawing activity start?” You have not checked the schedule. Answer without guessing and explain how to find the time.',
              starter: 'do not know yet → check the schedule',
              selfCheck: 'Did you say you do not know the time yet and need to check the schedule?',
            },
          ],
          retry: 'Say what you do not know yet, then name one way to check it.',
          transfer: 'If you want, practice another question you do not know the answer to yet.',
        },
      },
    },
    {
      id: 'presentation-practice-4',
      locales: {
        id: {
          title: 'Latihan presentasi',
          goal: 'Sampaikan presentasi singkat dengan alur yang runtut dan satu topik.',
          example:
            'Saya akan menjelaskan cara menyiapkan perlengkapan menggambar. Perlengkapan yang siap membantu kita mulai bekerja tanpa mencari alat. Misalnya, letakkan kertas, pensil, dan penghapus di meja. Jadi, siapkan perlengkapan sebelum mulai menggambar.',
          exampleNote:
            'Pembukaan, alasan, contoh, dan penutup tetap membahas persiapan menggambar.',
          exercise: { kind: 'speak' },
          practices: [
            {
              prompt:
                'Rekomendasikan satu buku atau permainan yang kamu kenal kepada teman sekelas. Sampaikan pesan, alasan, contoh, dan penutup dengan kata-katamu sendiri.',
              starter: 'pesan → alasan → contoh → penutup',
              selfCheck: 'Apakah semua bagian membahas buku atau permainan yang kamu pilih?',
            },
            {
              prompt:
                'Jelaskan kepada teman sekelas cara menyiapkan perlengkapan sebelum menggambar. Sampaikan tujuan, alasan, contoh perlengkapan, dan penutup dengan kata-katamu sendiri.',
              starter: 'tujuan → alasan → contoh → penutup',
              selfCheck:
                'Apakah penjelasanmu tetap membahas persiapan menggambar dari awal sampai akhir?',
            },
          ],
          retry: 'Pilih satu topik. Coba lagi dengan urutan pesan, alasan, contoh, lalu penutup.',
          transfer:
            'Jika mau, sampaikan kepada orang yang kamu percaya dan tanyakan pesan apa yang mereka ingat.',
        },
        en: {
          title: 'Presentation practice',
          goal: 'Give a short presentation with a clear order and one topic.',
          example:
            'I will explain how to prepare drawing supplies. Having supplies ready helps us start work without searching for tools. For example, place paper, a pencil, and an eraser on the desk. So, prepare your supplies before drawing.',
          exampleNote: 'The opening, reason, example, and closing all describe preparing to draw.',
          exercise: { kind: 'speak' },
          practices: [
            {
              prompt:
                'Recommend a book or game you know to a classmate. Give a message, reason, example, and closing in your own words.',
              starter: 'message → reason → example → closing',
              selfCheck: 'Do all the parts describe the book or game you chose?',
            },
            {
              prompt:
                'Explain to a classmate how to prepare supplies before drawing. Give a purpose, reason, example of supplies, and closing in your own words.',
              starter: 'purpose → reason → example → closing',
              selfCheck: 'Does your explanation describe preparing to draw from start to finish?',
            },
          ],
          retry: 'Choose one topic. Try again with a message, reason, example, and closing.',
          transfer:
            'If you want, share it with someone you trust and ask which message they remember.',
        },
      },
    },
  ],
};

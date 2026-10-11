import type { LearningStage } from './learning-types.ts';

// Curriculum proposal for educator review, each lesson practices one listener skill.
export const listenerAwarenessStage: LearningStage = {
  id: 'listener-awareness',
  locales: {
    id: {
      title: 'Menjelaskan kepada pendengar',
      goal: 'Gunakan penjelasan yang jelas dan jawab pertanyaan pendengar.',
    },
    en: {
      title: 'Explaining to your listener',
      goal: 'Give clear explanations and respond to your listener’s questions.',
    },
  },
  lessons: [
    {
      id: 'listener-awareness-1',
      locales: {
        id: {
          title: 'Menjelaskan arti kata',
          goal: 'Jelaskan arti kata yang belum dikenal pendengar.',
          example: 'Kami membuat draf, yaitu tulisan awal yang masih dapat diperbaiki.',
          exampleNote: 'Arti kata “draf” dijelaskan langsung setelah kata itu disebutkan.',
          exercise: { kind: 'speak' },
          practices: [
            {
              prompt: 'Temanmu bertanya, “Apa itu draf?” Jelaskan dengan satu kalimat.',
              starter: 'Draf adalah …',
              selfCheck: 'Apakah kamu menjelaskan arti kata “draf”?',
            },
            {
              prompt:
                'Denah adalah gambar yang menunjukkan letak tempat. Dalam presentasi, jelaskan arti “denah” kepada pendengar.',
              starter: 'Denah adalah …',
              selfCheck: 'Apakah kamu menjelaskan arti kata “denah”?',
            },
          ],
          retry: 'Sebutkan kata itu, lalu jelaskan artinya dengan kata yang lebih mudah dipahami.',
          transfer: 'Jika kamu mau, jelaskan arti satu kata dari pelajaranmu kepada teman.',
        },
        en: {
          title: 'Explaining a word',
          goal: 'Explain a word your listener may not know.',
          example: 'We made a draft, an early version of our writing that we can still change.',
          exampleNote: 'The meaning of “draft” comes immediately after the word.',
          exercise: { kind: 'speak' },
          practices: [
            {
              prompt: 'Your friend asks, “What is a draft?” Explain it in one sentence.',
              starter: 'A draft is …',
              selfCheck: 'Did you explain what “draft” means?',
            },
            {
              prompt:
                'A floor plan is a drawing that shows where rooms are. Explain “floor plan” to your audience during a presentation.',
              starter: 'A floor plan is …',
              selfCheck: 'Did you explain what “floor plan” means?',
            },
          ],
          retry: 'Name the word, then explain its meaning using more familiar words.',
          transfer: 'If you want, explain one word from your schoolwork to a friend.',
        },
      },
    },
    {
      id: 'listener-awareness-2',
      locales: {
        id: {
          title: 'Memberi contoh yang sesuai',
          goal: 'Beri contoh yang membantu pendengar memahami penjelasanmu.',
          example:
            'Buku dapat dikelompokkan agar mudah dicari. Misalnya, buku cerita di satu bagian dan buku pelajaran di bagian lain.',
          exampleNote: 'Contoh itu menunjukkan cara mengelompokkan buku.',
          exercise: {
            kind: 'choice',
            question: 'Contoh mana yang menjelaskan cara mengelompokkan buku?',
            options: [
              'Rak buku kita berwarna cokelat.',
              'Ada banyak buku di rak.',
              'Taruh buku cerita bersama, pisahkan dari buku pelajaran.',
            ],
            correctOption: 2,
            success: 'Contoh itu menunjukkan buku mana yang dikelompokkan bersama.',
            hint: 'Cari contoh yang menunjukkan cara mengelompokkan buku.',
          },
          practices: [
            {
              prompt:
                'Jelaskan cara menata alat tulis. Beri satu contoh alat yang dapat dikelompokkan bersama.',
              starter: 'Misalnya, kita dapat menaruh …',
              selfCheck: 'Apakah contohmu menunjukkan alat yang dapat dikelompokkan bersama?',
            },
            {
              prompt:
                'Kamu menjelaskan cara menghemat kertas kepada kelas. Beri satu contoh tindakan yang dapat dilakukan.',
              starter: 'Kita dapat menghemat kertas. Misalnya, …',
              selfCheck: 'Apakah contohmu menunjukkan tindakan untuk menghemat kertas?',
            },
          ],
          retry: 'Pilih satu tindakan yang sesuai dengan penjelasanmu, lalu sebutkan contohnya.',
          transfer: 'Jika kamu mau, tambahkan satu contoh saat menjelaskan tugas sekolah.',
        },
        en: {
          title: 'Giving a relevant example',
          goal: 'Give an example that helps your listener understand your explanation.',
          example:
            'Books can be grouped so they are easy to find. For example, put storybooks in one section and textbooks in another.',
          exampleNote: 'That example shows how to group the books.',
          exercise: {
            kind: 'choice',
            question: 'Which example explains how to group books?',
            options: [
              'Our bookshelf is brown.',
              'There are many books on the shelf.',
              'Put storybooks together, separate from textbooks.',
            ],
            correctOption: 2,
            success: 'That example shows which books belong together.',
            hint: 'Look for an example that shows how to group books.',
          },
          practices: [
            {
              prompt:
                'Explain how to organize school supplies. Give one example of items you could group together.',
              starter: 'For example, we could put …',
              selfCheck: 'Does your example show which supplies could go together?',
            },
            {
              prompt:
                'You are explaining how to save paper to your class. Give one example of something people can do.',
              starter: 'We can save paper. For example, …',
              selfCheck: 'Does your example show an action that saves paper?',
            },
          ],
          retry: 'Choose one action that fits your explanation, then give that example.',
          transfer: 'If you want, include one example when explaining a school assignment.',
        },
      },
    },
    {
      id: 'listener-awareness-3',
      locales: {
        id: {
          title: 'Menjawab pertanyaan',
          goal: 'Jawab hal yang ditanyakan pendengar.',
          example: '“Di mana kita menaruh gambar?” “Di papan dekat pintu kelas.”',
          exampleNote: 'Pertanyaannya meminta tempat, jadi jawabannya menyebutkan tempat.',
          exercise: { kind: 'speak' },
          practices: [
            {
              prompt:
                'Morii bertanya, “Apa yang perlu dibawa untuk menggambar?” Jawab dalam satu kalimat.',
              starter: 'Untuk menggambar, kita perlu membawa …',
              selfCheck: 'Apakah kamu menyebutkan alat yang perlu dibawa?',
            },
            {
              prompt:
                'Kamu membuat poster secara berkelompok. Morii bertanya, “Mengapa tugasnya dibagi?” Jawab dengan satu alasan.',
              starter: 'Tugasnya dibagi karena …',
              selfCheck: 'Apakah kamu menjelaskan alasan pembagian tugas?',
            },
          ],
          retry: 'Perhatikan apa yang ditanyakan, lalu jawab bagian itu secara langsung.',
          transfer:
            'Jika kamu mau, minta teman bertanya tentang tugasmu, lalu jawab pertanyaannya.',
        },
        en: {
          title: 'Answering a question',
          goal: 'Respond to what your listener asks.',
          example: '“Where should we put the picture?” “On the board near the classroom door.”',
          exampleNote: 'The question asks for a place, so the answer names a place.',
          exercise: { kind: 'speak' },
          practices: [
            {
              prompt: 'Morii asks, “What should we bring for drawing?” Answer in one sentence.',
              starter: 'For drawing, we should bring …',
              selfCheck: 'Did you name something to bring for drawing?',
            },
            {
              prompt:
                'Your group is making a poster. Morii asks, “Why did you divide the tasks?” Answer with one reason.',
              starter: 'We divided the tasks because …',
              selfCheck: 'Did you explain a reason for dividing the tasks?',
            },
          ],
          retry: 'Listen to what the question asks, then answer that part directly.',
          transfer: 'If you want, ask a friend to ask about your assignment, then answer.',
        },
      },
    },
    {
      id: 'listener-awareness-4',
      locales: {
        id: {
          title: 'Memperjelas maksud',
          goal: 'Perjelas bagian yang salah dipahami pendengar.',
          example:
            '“Simpan bukunya di rak.” “Semua buku?” “Maksudku, hanya buku yang sudah selesai dibaca.”',
          exampleNote: 'Jawaban terakhir memperjelas buku mana yang perlu disimpan.',
          exercise: { kind: 'speak' },
          practices: [
            {
              prompt:
                'Kamu meminta Morii mengambil pensil. Morii bertanya, “Semua pensil?” Jelaskan bahwa kamu memerlukan satu pensil saja.',
              starter: 'Maksudku, …',
              selfCheck: 'Apakah kamu memperjelas jumlah pensil yang diperlukan?',
            },
            {
              prompt:
                'Kamu meminta kelompok membaca bagian kedua dari buku. Morii bertanya, “Seluruh buku?” Perjelas bagian yang perlu dibaca.',
              starter: 'Yang perlu dibaca hanya …',
              selfCheck: 'Apakah kamu memperjelas bagian buku yang perlu dibaca?',
            },
          ],
          retry: 'Sebutkan bagian yang disalahpahami, lalu jelaskan dengan lebih tepat.',
          transfer: 'Jika kamu mau, perjelas satu petunjuk tugas yang dapat membuat teman bingung.',
        },
        en: {
          title: 'Clarifying your meaning',
          goal: 'Clarify the part your listener misunderstood.',
          example:
            '“Put the books on the shelf.” “All the books?” “I mean only the books we have finished reading.”',
          exampleNote: 'The last answer clarifies which books to put away.',
          exercise: { kind: 'speak' },
          practices: [
            {
              prompt:
                'You ask Morii to bring a pencil. Morii asks, “All the pencils?” Explain that you need just one.',
              starter: 'I mean …',
              selfCheck: 'Did you clarify how many pencils you need?',
            },
            {
              prompt:
                'You ask your group to read the second section of a book. Morii asks, “The whole book?” Clarify which part to read.',
              starter: 'We only need to read …',
              selfCheck: 'Did you clarify which part of the book to read?',
            },
          ],
          retry: 'Name the part that was misunderstood, then explain it more precisely.',
          transfer: 'If you want, clarify one instruction that could confuse a classmate.',
        },
      },
    },
  ],
};

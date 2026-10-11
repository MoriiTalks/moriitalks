import { learningStages } from '@content/missions/presentation-foundations';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Morii } from '@/components/morii';
import { BackButton } from '@/components/navigation';
import { Screen } from '@/components/screen';
import { Heading, Note, Title } from '@/components/typography';
import { usePracticeSummary } from '@/features/learning/use-practice-summary';
import { useApp } from '@/state/app-context';
import { deviceTimeZone } from '@/state/practice-activity';
import { nextLesson } from '@/state/progress-model';

const weekdays = {
  id: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

// Attendance records and lesson attempts stay separate from assessed speaking skills.
export function ProgressScreen() {
  const { locale, completedMissionIds, practiceActivity, progressStorageStatus } = useApp();
  const summary = usePracticeSummary(practiceActivity);
  const id = locale === 'id';
  const loading = progressStorageStatus === 'loading';
  const allComplete = nextLesson(completedMissionIds) === undefined;
  const dateFormat = new Intl.DateTimeFormat(id ? 'id-ID' : 'en-US', {
    dateStyle: 'full',
    timeZone: 'UTC',
  });

  return (
    <Screen
      footer={
        <Button
          disabled={loading}
          onPress={() => {
            router.replace('/practice');
          }}
        >
          {allComplete
            ? id
              ? 'Ulangi latihan'
              : 'Replay practice'
            : id
              ? 'Lanjut latihan'
              : 'Continue practice'}
        </Button>
      }
    >
      <BackButton />
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Heading>{id ? 'Catatan latihan' : 'Practice record'}</Heading>
        </View>
        <Morii size={80} pose="wave" />
      </View>
      {loading ? (
        <View className="items-center gap-3 py-12">
          <Morii size={128} />
          <Note>{id ? 'Memuat catatan latihan…' : 'Loading practice records…'}</Note>
        </View>
      ) : (
        <>
          <Card>
            <Title>{id ? 'Latihan minggu ini' : 'Practice this week'}</Title>
            <View className="flex-row gap-1">
              {summary.week.map((day, index) => {
                const fullDate = dateFormat.format(new Date(`${day.date}T12:00:00Z`));
                const status = day.completed
                  ? id
                    ? 'Sudah berlatih'
                    : 'Practiced'
                  : id
                    ? 'Belum tercatat'
                    : 'No practice recorded';
                return (
                  <View
                    key={day.date}
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={`${fullDate}, ${status}${day.today ? (id ? ', hari ini' : ', today') : ''}`}
                    className="min-w-0 flex-1 items-center gap-2"
                  >
                    <Text className="text-xs font-medium text-muted">
                      {weekdays[locale][index]}
                    </Text>
                    <View
                      className={`size-8 items-center justify-center rounded-full ${day.completed ? 'bg-mint-strong' : 'bg-mist'} ${day.today ? 'border-2 border-teal' : ''}`}
                    >
                      {day.completed ? (
                        <Icon name="check" size={19} />
                      ) : (
                        <View className="size-1 rounded-full bg-line" />
                      )}
                    </View>
                    <Text className={`text-xs ${day.today ? 'font-bold text-teal' : 'text-muted'}`}>
                      {String(Number(day.date.slice(-2)))}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View className="gap-1">
              <Text className="text-base font-semibold text-ink">
                {id
                  ? `${String(summary.weeklyDays)} hari latihan minggu ini`
                  : `${String(summary.weeklyDays)} practice ${summary.weeklyDays === 1 ? 'day' : 'days'} this week`}
              </Text>
              <Note>
                {id
                  ? `Hari ini: ${summary.practicedToday ? 'sudah berlatih' : 'belum tercatat'}.`
                  : `Today: ${summary.practicedToday ? 'practiced' : 'no practice recorded'}.`}
              </Note>
            </View>
            {summary.clockChanged && (
              <Note>
                {id ? 'Periksa tanggal dan waktu perangkat.' : 'Check the device date and time.'}
              </Note>
            )}
          </Card>
          <View className="flex-row items-center gap-3 px-1">
            <Icon name="practice" size={24} />
            <Text className="min-w-0 flex-1 text-base font-semibold text-ink">
              {id
                ? `${String(summary.streak)} hari latihan berturut-turut`
                : `${String(summary.streak)} consecutive practice ${summary.streak === 1 ? 'day' : 'days'}`}
            </Text>
          </View>
          <Card>
            <Title>{id ? 'Latihan yang sudah dicoba' : 'Lessons tried'}</Title>
            {learningStages.map((stage, index) => {
              const completedCount = stage.lessons.filter((lesson) =>
                completedMissionIds.includes(lesson.id),
              ).length;
              return (
                <View key={stage.id} className="gap-2 py-1">
                  <View className="flex-row items-start justify-between gap-3">
                    <Text className="min-w-0 flex-1 text-base leading-6 font-medium text-ink">
                      {String(index + 1)}. {stage.locales[locale].title}
                    </Text>
                    <Text className="text-sm leading-6 text-muted">
                      {String(completedCount)} / {String(stage.lessons.length)}
                    </Text>
                  </View>
                  <View
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={
                      id
                        ? `${String(completedCount)} dari ${String(stage.lessons.length)} latihan sudah dicoba`
                        : `${String(completedCount)} of ${String(stage.lessons.length)} lessons tried`
                    }
                    className="flex-row gap-2"
                  >
                    {stage.lessons.map((lesson) => (
                      <View
                        key={lesson.id}
                        className={`h-2 flex-1 rounded-full ${completedMissionIds.includes(lesson.id) ? 'bg-teal' : 'bg-line'}`}
                      />
                    ))}
                  </View>
                </View>
              );
            })}
            <Note>
              {id
                ? 'Selesai latihan adalah catatan percobaanmu, bukan nilai kemampuan.'
                : 'Completion records your practice attempt, not a skill score.'}
            </Note>
          </Card>
          {practiceActivity && practiceActivity.timeZone !== deviceTimeZone() && (
            <Note>
              {id
                ? `Tanggal mengikuti waktu ${practiceActivity.timeZone}.`
                : `Dates use ${practiceActivity.timeZone} time.`}
            </Note>
          )}
          {progressStorageStatus === 'unavailable' && (
            <Note>
              {id
                ? 'Penyimpanan belum tersedia. Catatan baru hanya berlaku selama aplikasi terbuka.'
                : 'Storage is unavailable. New records last for this app session.'}
            </Note>
          )}
        </>
      )}
    </Screen>
  );
}

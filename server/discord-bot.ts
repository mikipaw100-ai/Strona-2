import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';

let discordClient: Client | null = null;

// Channel Router Configuration
let bookingsChannelId: string | null = null;
let logsChannelId: string | null = null;
let commandsChannelId: string | null = null;

// Clean references passed from server.ts to avoid circular dependencies
let getAppointmentsList: () => any[] = () => [];
let saveAppointmentsList: (data: any[]) => void = () => {};
let sendNotifications: (appt: any) => Promise<void> = async () => {};

export function initDiscordBot(
  readDB: () => any[],
  writeDB: (data: any[]) => void,
  triggerSMSReminder: (appt: any) => Promise<void>
) {
  const token = process.env.DISCORD_BOT_TOKEN;
  
  // Custom multi-channel IDs
  bookingsChannelId = process.env.DISCORD_BOOKINGS_CHANNEL_ID || null;
  logsChannelId = process.env.DISCORD_LOGS_CHANNEL_ID || null;
  commandsChannelId = process.env.DISCORD_COMMANDS_CHANNEL_ID || null;

  getAppointmentsList = readDB;
  saveAppointmentsList = writeDB;
  sendNotifications = triggerSMSReminder;

  if (!token || token.trim() === '') {
    console.log('[DISCORD BOT] Brak DISCORD_BOT_TOKEN w .env. Bot Discorda nie został uruchomiony.');
    return;
  }

  try {
    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    discordClient.once('ready', () => {
      console.log(`[DISCORD BOT] Zalogowano pomyślnie jako: ${discordClient?.user?.tag}!`);
      if (discordClient?.user) {
        discordClient.user.setPresence({
          activities: [{ name: 'Centrum Analizy Zachowania 🏥 | Panel Administratora' }],
          status: 'online',
        });
      }

      // If logs channel is defined, post the start announcement there
      const targetLogsId = logsChannelId || bookingsChannelId || commandsChannelId;
      if (targetLogsId) {
        discordClient.channels.fetch(targetLogsId)
          .then((channel: any) => {
            if (channel && typeof channel.send === 'function') {
              const bootEmbed = new EmbedBuilder()
                .setTitle('🟢 Bot Centrum Analizy Zachowania Online!')
                .setDescription(
                  `Połączono pomyślnie z systemem kliniki.\n\n` +
                  `🛰️ **Działanie kanałów:**\n` +
                  `• 📅 Nowe Rezerwacje: <#${bookingsChannelId}>\n` +
                  `• ⚙️ Logi i Potwierdzenia: <#${logsChannelId}>\n` +
                  `• 💻 Sterowanie i Komendy: <#${commandsChannelId}>\n\n` +
                  `Użyj komendy \`!pomoc\` na kanale sterowania, aby zobaczyć dostępne opcje.`
                )
                .setColor(0x477267);
              channel.send({ embeds: [bootEmbed] }).catch(() => {});
            }
          })
          .catch(() => {
            console.log(`[DISCORD BOT] Nie udało się wysłać powiadomienia powitalnego.`);
          });
      }
    });

    discordClient.on('messageCreate', async (message) => {
      // Ignore bot's own messages
      if (message.author.bot) return;

      const content = message.content.trim();

      // Check if command prefixes are used
      if (!content.startsWith('!')) return;

      // STRICT CHECK: Commands can ONLY be executed in the Admin/Commands Channel
      if (commandsChannelId && message.channel.id !== commandsChannelId) {
        // Find if this is a supported command, and if so, gently redirect the user
        const knownCommands = ['!pomoc', '!help', '!wizyty', '!list', '!potwierdz', '!confirm', '!anuluj', '!cancel', '!szczegoly', '!details', '!zresetuj'];
        const mainPrefix = content.split(' ')[0];
        
        if (knownCommands.includes(mainPrefix)) {
          const redirectEmbed = new EmbedBuilder()
            .setTitle('⚠️ Odmowa dostępu')
            .setDescription(`Zarządzanie systemem Centrum Analizy Zachowania jest dozwolone wyłącznie na dedykowanym kanale sterowania: <#${commandsChannelId}>.`)
            .setColor(0xd93838);
          await message.reply({ embeds: [redirectEmbed] }).catch(() => {});
        }
        return;
      }

      // Help menu
      if (content === '!pomoc' || content === '!help') {
        const helpEmbed = new EmbedBuilder()
          .setTitle('📋 Menu Sterowania Centrum Analizy Zachowania')
          .setDescription('Jako administrator możesz w pełni zarządzać pacjentami i rezerwacjami bezpośrednio z Discorda!')
          .addFields(
            { name: '🟢 `!wizyty` lub `!list`', value: 'Pokazuje wszystkie zarejestrowane terminy i ich status płatności.' },
            { name: '✅ `!potwierdz <id>`', value: 'Zatwierdza rezerwację (pacjent otrzyma prawdziwy e-mail/SMS potwierdzający).' },
            { name: '❌ `!anuluj <id>`', value: 'Anuluje wybraną rezerwację i zwalnia termin.' },
            { name: '🔍 `!szczegoly <id>`', value: 'Wyświetla dane kontaktowe (e-mail, telefon, historię wysłanych alertów).' },
            { name: '🔥 `!zresetuj`', value: 'Usuwa całkowicie WSZYSTKIE wizyty w systemie.' },
            { name: '🗑️ `!zresetuj <e-mail_lub_telefon>`', value: 'Usuwa wszystkie rezerwacje powiązane z podanym adresem e-mail lub telefonem.' }
          )
          .setColor(0x477267)
          .setFooter({ text: 'Centrum Analizy Zachowania • Panel Administratora' });

        await message.reply({ embeds: [helpEmbed] }).catch(() => {});
        return;
      }

      // List all bookings
      if (content === '!wizyty' || content === '!list') {
        const appts = getAppointmentsList();
        if (appts.length === 0) {
          await message.reply('Brak zarejestrowanych wizyt w systemie. Kalendarz jest czysty!').catch(() => {});
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('📅 Aktualne Rezerwacje • Centrum Analizy Zachowania')
          .setColor(0x477267);

        const listText = appts.slice(0, 10).map((a) => {
          let statusEmoji = '🟡';
          if (a.status === 'confirmed') statusEmoji = '🟢';
          if (a.status === 'cancelled') statusEmoji = '🔴';
          
          return `\`${a.id}\` | **${a.date} o ${a.timeSlot}**\nPacjent: *${a.patientName}*\nStatus: ${statusEmoji} **${a.status.toUpperCase()}** • Płatność: *${a.paymentMethod}*\n---`;
        }).join('\n');

        embed.setDescription(listText + (appts.length > 10 ? `\n\n*oraz ${appts.length - 10} innych wizyt...*` : ''));
        embed.setFooter({ text: 'Użyj `!szczegoly <id>` aby poznać dane kontaktowe pacjenta.' });

        await message.reply({ embeds: [embed] }).catch(() => {});
        return;
      }

      // Confirm Appointment command
      if (content.startsWith('!potwierdz') || content.startsWith('!confirm')) {
        const parts = content.split(' ');
        const id = parts[1];
        if (!id) {
          await message.reply('Podaj poprawne ID wizyty np: `!potwierdz apt-xyz`').catch(() => {});
          return;
        }

        const appts = getAppointmentsList();
        const apptIdx = appts.findIndex(a => a.id === id);

        if (apptIdx === -1) {
          await message.reply(`❌ Nie znaleziono wizyty o ID: \`${id}\`. Sprawdź komendę \`!wizyty\``).catch(() => {});
          return;
        }

        const appt = appts[apptIdx];
        appt.status = 'confirmed';
        
        await message.channel.sendTyping();
        await sendNotifications(appt);
        saveAppointmentsList(appts);

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Wizyta Potwierdzona z Discorda!')
          .setDescription(`Zatwierdzono rezerwację \`${appt.id}\` pacjenta **${appt.patientName}** u specjalisty: **${appt.doctorName}**.\n\n**Termin:** ${appt.date} o ${appt.timeSlot}`)
          .addFields(
            { name: '📬 Informacja o wysyłce', value: appt.smsReminderSent ? '🟢 Powiadomienia (Email/Telegram/SMS) zostały pomyślnie wysłane!' : '🟡 Brak skonfigurowanych integracji w .env - wygenerowano logi w trybie deweloperskim.' }
          )
          .setColor(0x477267);

        await message.reply({ embeds: [successEmbed] }).catch(() => {});

        // Optional: Send feedback to the log channel too
        if (logsChannelId) {
          try {
            const ch: any = await discordClient.channels.fetch(logsChannelId);
            if (ch && typeof ch.send === 'function') {
              const logEmbed = new EmbedBuilder()
                .setTitle('⚙️ Log zdarzenia: Potwierdzenie')
                .setDescription(`Wizyta \`${appt.id}\` pacjenta **${appt.patientName}** została ręcznie autoryzowana przez Discord Admin Command.`)
                .setColor(0x477267)
                .setTimestamp();
              await ch.send({ embeds: [logEmbed] });
            }
          } catch {}
        }
        return;
      }

      // Cancel appointment command
      if (content.startsWith('!anuluj') || content.startsWith('!cancel')) {
        const parts = content.split(' ');
        const id = parts[1];
        if (!id) {
          await message.reply('Podaj poprawne ID wizyty np: `!anuluj apt-xyz`').catch(() => {});
          return;
        }

        const appts = getAppointmentsList();
        const apptIdx = appts.findIndex(a => a.id === id);

        if (apptIdx === -1) {
          await message.reply(`❌ Nie znaleziono wizyty o ID: \`${id}\``).catch(() => {});
          return;
        }

        const appt = appts[apptIdx];
        appt.status = 'cancelled';
        saveAppointmentsList(appts);

        const cancelEmbed = new EmbedBuilder()
          .setTitle('🔴 Wizyta Anulowana')
          .setDescription(`Rezerwacja \`${appt.id}\` pacjenta **${appt.patientName}** została pomyślnie anulowana. Termin **${appt.date} (${appt.timeSlot})** jest ponownie dostępny.`)
          .setColor(0xd93838);

        await message.reply({ embeds: [cancelEmbed] }).catch(() => {});

        // Optional: Send cancel status feedback logic to log channel
        if (logsChannelId) {
          try {
            const ch: any = await discordClient.channels.fetch(logsChannelId);
            if (ch && typeof ch.send === 'function') {
              const logEmbed = new EmbedBuilder()
                .setTitle('⚙️ Log zdarzenia: Anulowanie wizyty')
                .setDescription(`Wizyta \`${appt.id}\` pacjenta **${appt.patientName}** została anulowana z poziomu panelu Discord przez admina.`)
                .setColor(0xd93838)
                .setTimestamp();
              await ch.send({ embeds: [logEmbed] });
            }
          } catch {}
        }
        return;
      }

      // Detail details showing
      if (content.startsWith('!szczegoly') || content.startsWith('!details')) {
        const parts = content.split(' ');
        const id = parts[1];
        if (!id) {
          await message.reply('Podaj poprawne ID wizyty np: `!szczegoly apt-xyz`').catch(() => {});
          return;
        }

        const appts = getAppointmentsList();
        const appt = appts.find(a => a.id === id);

        if (!appt) {
          await message.reply(`❌ Nie znaleziono wizyty o ID: \`${id}\``).catch(() => {});
          return;
        }

        let statusText = '🟡 Oczekuje na płatność';
        if (appt.status === 'confirmed') statusText = '🟢 Potwierdzona';
        if (appt.status === 'cancelled') statusText = '🔴 Anulowana';

        const detailEmbed = new EmbedBuilder()
          .setTitle(`🔍 Szczegóły rezerwacji: ${appt.id}`)
          .addFields(
            { name: '👤 Pacjent', value: appt.patientName, inline: true },
            { name: '📞 Telefon', value: appt.patientPhone, inline: true },
            { name: '📧 Adres E-mail', value: appt.patientEmail, inline: true },
            { name: '🩺 Terapeuta', value: appt.doctorName, inline: true },
            { name: '📅 Data', value: appt.date, inline: true },
            { name: '⏰ Godzina', value: appt.timeSlot, inline: true },
            { name: '💳 Metoda Płatności', value: 'Stripe (Karta online)', inline: true },
            { name: '📊 Status', value: statusText, inline: true },
            { name: '📜 Logi Powiadomień', value: appt.smsLog ? `\`\`\`\n${appt.smsLog.substring(0, 900)}\n\`\`\`` : 'Brak logów.' }
          )
          .setColor(0x477267);

        await message.reply({ embeds: [detailEmbed] }).catch(() => {});
        return;
      }

      // Reset command for clearing all appointments or finding a user match (email/phone)
      if (content.startsWith('!zresetuj')) {
        const parts = content.split(' ');
        const target = parts[1]; // can be an email or a phone

        const appts = getAppointmentsList();

        if (!target) {
          // Reset all appointments
          saveAppointmentsList([]);
          
          const resetAllEmbed = new EmbedBuilder()
            .setTitle('🔥 Pełny Reset Bazy Wizyt')
            .setDescription(`Pomyślnie usunięto wszystkie (**${appts.length}**) rezerwacje z bazy danych Centrum Analizy Zachowania. Urządzenia pacjentów zostaną zaktualizowane automatycznie.`)
            .setColor(0xd93838)
            .setTimestamp();
            
          await message.reply({ embeds: [resetAllEmbed] }).catch(() => {});

          if (logsChannelId) {
            try {
              const ch: any = await discordClient.channels.fetch(logsChannelId);
              if (ch && typeof ch.send === 'function') {
                const logEmbed = new EmbedBuilder()
                  .setTitle('🚨 Pełne czyszczenie bazy')
                  .setDescription(`Wszystkie rezerwacje w systemie zostały właśnie wyczyszczone przez administratora za pomocą komendy Discord.`)
                  .setColor(0xd93838)
                  .setTimestamp();
                await ch.send({ embeds: [logEmbed] });
              }
            } catch {}
          }
          return;
        }

        // Reset specific email or phone matching appointments
        const cleanTarget = target.trim().toLowerCase();
        const initialCount = appts.length;
        
        const filteredAppts = appts.filter(a => {
          const emailMatch = a.patientEmail?.trim().toLowerCase() === cleanTarget;
          const phoneMatch = a.patientPhone?.trim().replace(/\s+/g, '') === cleanTarget.replace(/\s+/g, '');
          return !emailMatch && !phoneMatch;
        });

        const deletedCount = initialCount - filteredAppts.length;

        if (deletedCount === 0) {
          await message.reply(`❌ Nie odnaleziono żadnej wizyty powiązanej z adresem e-mail lub telefonem: \`${target}\`.`).catch(() => {});
          return;
        }

        saveAppointmentsList(filteredAppts);

        const resetUserEmbed = new EmbedBuilder()
          .setTitle('🗑️ Usunięcie rezerwacji pacjenta')
          .setDescription(`Pomyślnie usunięto wszystkie (**${deletedCount}**) rezerwacje powiązane z pacjentem o danych: \`${target}\`.`)
          .setColor(0xd93838)
          .setTimestamp();

        await message.reply({ embeds: [resetUserEmbed] }).catch(() => {});

        if (logsChannelId) {
          try {
            const ch: any = await discordClient.channels.fetch(logsChannelId);
            if (ch && typeof ch.send === 'function') {
              const logEmbed = new EmbedBuilder()
                .setTitle('⚙️ Log: Usunięto wizyty pacjenta')
                .setDescription(`Wizyty powiązane z adresem \`${target}\` (${deletedCount} szt.) zostały usunięte z poziomu Discord komendy przez admina.`)
                .setColor(0xd93838)
                .setTimestamp();
              await ch.send({ embeds: [logEmbed] });
            }
          } catch {}
        }
        return;
      }
    });

    discordClient.login(token);
  } catch (err: any) {
    console.error('[DISCORD BOT] Błąd logowania/startu bota Discord:', err.message);
  }
}

// Function to notify when a booking gets registered or updated in real-time
export async function notifyDiscordNewBooking(appt: any) {
  if (!discordClient) return;

  // 1. Send Booking confirmation sheet to the BOOKINGS Channel
  if (bookingsChannelId) {
    try {
      const channel: any = await discordClient.channels.fetch(bookingsChannelId);
      if (channel && typeof channel.send === 'function') {
        let statusEmoji = '🟡';
        if (appt.status === 'confirmed') statusEmoji = '🟢';
        if (appt.status === 'cancelled') statusEmoji = '🔴';

        const notifyEmbed = new EmbedBuilder()
          .setTitle('🔔 Nowa Rezerwacja w Centrum Analizy Zachowania! 📅')
          .setDescription(`Pacjent właśnie zarezerwował termin online. Możesz nim zarządzać bezpośrednio z Discorda za pomocą \`!potwierdz ${appt.id}\` na kanale sterowania.`)
          .addFields(
            { name: '👤 Pacjent', value: `**${appt.patientName}**`, inline: true },
            { name: '📅 Termin', value: `**${appt.date} o godz ${appt.timeSlot}**`, inline: true },
            { name: '🩺 Specjalista', value: appt.doctorName, inline: true },
            { name: '📞 Kontakt i E-mail', value: `${appt.patientPhone} | ${appt.patientEmail}`, inline: false },
            { name: '💳 Płatność i Status', value: `Metoda: \`${appt.paymentMethod}\` • Status: ${statusEmoji} **${appt.status.toUpperCase()}**`, inline: false }
          )
          .setColor(0x477267)
          .setFooter({ text: `Użyj: !potwierdz ${appt.id} | !anuluj ${appt.id} na odpowiednim kanale` });

        await channel.send({ embeds: [notifyEmbed] });
      }
    } catch (err: any) {
      console.error('[DISCORD BOT] Błąd wysyłania powiadomienia o nowej wizycie na Discord (bookings):', err.message);
    }
  }

  // 2. Also send a subtle logging line to the system alert/logs channel
  if (logsChannelId) {
    try {
      const channel: any = await discordClient.channels.fetch(logsChannelId);
      if (channel && typeof channel.send === 'function') {
        const logEmbed = new EmbedBuilder()
          .setTitle('⚙️ Log Zdarzenia: Nowy zapis')
          .setDescription(`Zarejestrowano wizytę \`${appt.id}\` o statusie **${appt.status.toUpperCase()}** dla pacjenta: *${appt.patientName}*.`)
          .setColor(0x477267)
          .setTimestamp();
        await channel.send({ embeds: [logEmbed] });
      }
    } catch (err: any) {
      console.error('[DISCORD BOT] Błąd wysyłania logów na Discord:', err.message);
    }
  }
}


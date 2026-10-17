/* ═══════════════════════════════════════════════════════════
   RangeLab — i18n (ES / EN)
   Preferencia en localStorage + opcional preferred_lang del usuario.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var KEY = 'rangelab-lang';
  var SUPPORTED = ['es', 'en'];

  var DICT = {
    es: {
      // Common
      'common.theme': 'Tema claro/oscuro',
      'common.language': 'Idioma',
      'common.lang.es': 'Español',
      'common.lang.en': 'English',
      'common.save': 'Guardar',
      'common.cancel': 'Cancelar',
      'common.close': 'Cerrar',
      'common.logout': 'Cerrar sesión',
      'common.logoutConfirm': '¿Cerrar sesión?',
      'common.backPortal': 'Volver al portal',
      'common.loading': 'Cargando…',
      'common.error': 'Error',
      'common.success': 'Correcto',
      'common.admin': 'Admin',
      'common.free': 'Gratis',
      'common.plan': 'Plan',
      'common.profile': 'Mi perfil',
      'common.open': 'Abrir',
      'common.edit': 'Editar',
      'common.delete': 'Eliminar',
      'common.confirm': 'Confirmar',
      'common.yes': 'Sí',
      'common.no': 'No',
      'common.optional': 'opcional',
      'common.required': 'obligatorio',

      // Login
      'login.title': 'Entrar — RangeLab',
      'login.subtitle': 'Suite de herramientas de póker',
      'login.eyebrow': 'Suite completa de póker',
      'login.hero': 'Tu laboratorio de póker.',
      'login.heroEm': 'En tu servidor.',
      'login.desc': 'Equity, preflop, bankroll, replay, range analyzer y MTT exploiter. Datos privados en tu servidor.',
      'login.authTitle': 'Iniciar sesión',
      'login.authSub': 'Accede a tu laboratorio privado',
      'login.tabLogin': 'Entrar',
      'login.tabRegister': 'Crear cuenta',
      'login.displayName': 'Nombre visible',
      'login.displayNamePh': 'Opcional',
      'login.username': 'Usuario',
      'login.usernamePh': 'min. 3 caracteres',
      'login.password': 'Contraseña',
      'login.passwordPh': 'min. 8 caracteres',
      'login.invite': 'Código de invitación',
      'login.invitePh': 'Ej. PERTO',
      'login.inviteHint': 'Sin código = plan free (Equity + MTT Exploiter). Con código se desbloquean las herramientas de ese plan.',
      'login.submit': 'Entrar',
      'login.submitRegister': 'Crear cuenta',
      'login.registerTitle': 'Crear cuenta',
      'login.registerSub': 'Registra tu usuario en este servidor',
      'login.hintExists': 'Si el usuario ya existe, usa Entrar. No vuelvas a crear la misma cuenta.',
      'login.wantFull': '¿Quieres acceso completo?',
      'login.requestCode': 'Solicita tu código por correo',
      'login.feat1': 'Acceso seguro con tu cuenta',
      'login.feat2': 'Disponible en escritorio y móvil',
      'login.feat3': '8 herramientas · un solo acceso',
      'login.feat4': 'Códigos de invitación por plan',
      'login.remember': 'Recordar sesión en este dispositivo',
      'login.rememberHint': 'Si cierras sesión podrás entrar con otra cuenta. Sin marcar, la sesión se cierra al cerrar el navegador.',
      'login.footer': 'Creado por RangeSoft® · © 2026',

      // Portal
      'portal.title': 'RangeLab — Poker Tools',
      'portal.heroEyebrow': 'Suite completa de póker',
      'portal.heroTitle': '8 herramientas.',
      'portal.heroGrad': 'Un solo laboratorio.',
      'portal.heroDesc': 'Equity, Preflop, Bankroll, Hand Lab, Range Lab, MTT Exploiter y AI Table. Todo en un mismo lugar, listo para jugar.',
      'portal.statTools': 'herramientas',
      'portal.statPrivate': 'Datos privados',
      'portal.statMulti': 'Multi-dispositivo',
      'portal.pinTip': 'Tip:',
      'portal.pinTipText': 'Toca la chincheta en una tarjeta para fijarla: aparece arriba como círculo y se abre al tocarla.',
      'portal.allTools': 'Todas las herramientas',
      'portal.locked': 'Bloqueada',
      'portal.lockedHint': 'Requiere plan o código de invitación',
      'portal.openTool': 'Abrir',
      'portal.pin': 'Fijar arriba',
      'portal.unpin': 'Desfijar',
      'portal.changePwd': 'Cambiar contraseña',
      'portal.upgrade': 'Cambiar / mejorar plan',
      'portal.logout': 'Cerrar sesión',
      'portal.adminDash': 'Admin Dashboard',

      // Profile panel
      'profile.title': 'Mi perfil',
      'profile.subtitle': 'Cuenta, membresía y datos',
      'profile.sectionAccount': 'Cuenta',
      'profile.sectionMembership': 'Membresía',
      'profile.sectionData': 'Datos guardados',
      'profile.sectionSecurity': 'Seguridad',
      'profile.sectionLang': 'Idioma',
      'profile.username': 'Usuario',
      'profile.displayName': 'Nombre visible',
      'profile.role': 'Rol',
      'profile.plan': 'Plan actual',
      'profile.inviteUsed': 'Código usado',
      'profile.created': 'Cuenta creada',
      'profile.lastLogin': 'Último acceso',
      'profile.noInvite': 'Ninguno',
      'profile.roleAdmin': 'Administrador',
      'profile.roleUser': 'Usuario',
      'profile.changeUsername': 'Cambiar usuario',
      'profile.changeDisplay': 'Cambiar nombre visible',
      'profile.changePassword': 'Cambiar contraseña',
      'profile.oldPassword': 'Contraseña actual',
      'profile.newPassword': 'Nueva contraseña',
      'profile.confirmPassword': 'Confirmar nueva',
      'profile.saveProfile': 'Guardar cambios',
      'profile.pwdSaved': 'Contraseña cambiada correctamente',
      'profile.profileSaved': 'Perfil actualizado',
      'profile.pwdMismatch': 'Las contraseñas nuevas no coinciden',
      'profile.fillAll': 'Rellena todos los campos',
      'profile.pwdMin': 'La nueva contraseña debe tener al menos 4 caracteres',
      'profile.dataEquity': 'Sesiones Equity',
      'profile.dataPreflop': 'Tablas Preflop',
      'profile.dataTournaments': 'Torneos',
      'profile.dataTransactions': 'Movimientos',
      'profile.dataHands': 'Manos (Hand Lab)',
      'profile.dataNotes': 'Notas de manos',
      'profile.dataFavorites': 'Favoritos',
      'profile.toolsAccess': 'Herramientas disponibles',
      'profile.langHint': 'El idioma se aplica de inmediato en toda la suite.',
      'profile.openProfile': 'Ver perfil',
      'profile.sectionEdit': 'Editar cuenta',

      // Tools names (product)
      'tool.equity': 'Equity Lab',
      'tool.preflop': 'Preflop Lab',
      'tool.tracker': 'Bankroll Lab',
      'tool.feltlab': 'Hand Lab',
      'tool.range-analyzer': 'Range Lab',
      'tool.mtt-exploiter': 'MTT Exploiter',
      'tool.ailab': 'AI Table',
      'tool.equity.desc': 'Equity multi-jugador · Monte Carlo',
      'tool.preflop.desc': 'Tablas 6-max / 8-max · Trainer',
      'tool.tracker.desc': 'Bankroll · Torneos · ROI',
      'tool.feltlab.desc': 'Replay · Stats · Notas',
      'tool.range-analyzer.desc': 'Heatmaps · Leaks · GTO 8-max',
      'tool.mtt-exploiter.desc': 'Pool · Villain Profiler · Exploits',
      'tool.ailab.desc': 'Mesa vs IA · Hand Lab',

      // ── Common tool chrome ──
      'nav.menu': 'Menú',
      'nav.closeMenu': 'Cerrar menú',
      'nav.backPortal': 'Volver al portal',
      'nav.backPortalDesc': 'RangeLab Suite',
      'nav.navigation': 'Navegación',
      'nav.data': 'Datos',
      'nav.session': 'Sesión actual',
      'nav.serverStatus': 'Estado del servidor',
      'nav.logout': 'Cerrar sesión',
      'nav.logoutDesc': 'Salir de tu cuenta',
      'nav.help': 'Ayuda',
      'nav.helpDesc': 'Cómo funciona',
      'nav.credits': 'Créditos',
      'nav.creditsDesc': 'Autores del proyecto',
      'nav.settings': 'Ajustes',
      'common.exportJson': 'Exportar JSON',
      'common.exportJsonDesc': 'Descargar archivo',
      'common.importJson': 'Importar JSON',
      'common.importJsonDesc': 'Cargar desde archivo',
      'common.import': 'Importar',
      'common.export': 'Exportar',
      'common.save': 'Guardar',
      'common.close': 'Cerrar',
      'common.delete': 'Eliminar',
      'common.edit': 'Editar',
      'common.new': 'Nuevo',
      'common.start': 'Iniciar',
      'common.stop': 'Detener',
      'common.connected': 'Conectado',
      'common.offline': 'Sin conexión',
      'common.noData': 'Sin datos cargados',
      'common.confirmLogout': '¿Cerrar sesión?',

      // Equity Lab
      'eq.newSession': 'Nueva sesión',
      'eq.newSessionDesc': 'Empezar desde cero',
      'eq.saveSession': 'Guardar sesión',
      'eq.saveSessionDesc': 'Guardar en el servidor',
      'eq.mySessions': 'Mis sesiones',
      'eq.mySessionsDesc': 'Cargar / gestionar guardadas',
      'eq.potOdds': 'Pot Odds',
      'eq.potOddsDesc': 'Tabla de referencia rápida',
      'eq.saveJpg': 'Guardar como JPG',
      'eq.start': 'Iniciar',
      'eq.stop': 'Detener',
      'eq.players': 'Jugadores',
      'eq.board': 'Board',
      'eq.equity': 'Equity',
      'eq.wins': 'Gana',
      'eq.ties': 'Empate',
      'eq.range': 'Rango',
      'eq.hand': 'Mano',
      'eq.simulations': 'Simulaciones',
      'eq.iterations': 'Iteraciones',
      'eq.clearBoard': 'Limpiar board',
      'eq.randomBoard': 'Board aleatorio',
      'eq.addPlayer': 'Añadir jugador',
      'eq.removePlayer': 'Quitar jugador',

      // Preflop Lab
      'pf.navigation': 'Navegación',
      'pf.strategy': 'Estrategia',
      'pf.saveTable': 'Guardar tabla actual',
      'pf.saveTableDesc': 'Sincronizar con el servidor',
      'pf.newStrategy': 'Nueva estrategia',
      'pf.newStrategyDesc': 'Empezar desde cero',
      'pf.exportDesc': 'Descarga toda la estrategia',
      'pf.importDesc': 'Cargar estrategia desde archivo',
      'pf.trainer': 'Trainer',
      'pf.selectMode': 'Seleccionar',
      'pf.paintMode': 'Pintar',
      'pf.undo': 'Deshacer',
      'pf.copyRange': 'Copiar rango',
      'pf.pasteRange': 'Pegar rango',
      'pf.clearTable': 'Limpiar tabla',
      'pf.apply100': 'Aplicar 100% a selección',
      'pf.positions': 'Posiciones',
      'pf.actions': 'Acciones',
      'pf.tables': 'Tablas',

      // Bankroll Lab / Tracker
      'tr.deposit': 'Depositar',
      'tr.depositDesc': 'Añadir fondos al bankroll',
      'tr.withdraw': 'Retirar',
      'tr.withdrawDesc': 'Sacar fondos del bankroll',
      'tr.history': 'Historial',
      'tr.home': 'Inicio',
      'tr.registerTournament': 'Registrar Torneo',
      'tr.bankrollEvolution': 'Evolución del Bankroll',
      'tr.tournaments': 'Torneos',
      'tr.roi': 'ROI',
      'tr.profit': 'Beneficio',
      'tr.buyin': 'Buy-in',
      'tr.prize': 'Premio',
      'tr.position': 'Posición',
      'tr.room': 'Sala',
      'tr.date': 'Fecha',
      'tr.balance': 'Balance',
      'tr.stats': 'Estadísticas',
      'tr.filters': 'Filtros',
      'tr.all': 'Todos',
      'tr.weekly': 'Semanal',
      'tr.monthly': 'Mensual',
      'tr.dateRange': 'Rango de fechas',
      'tr.subtitle': 'Torneos · ROI · RangeLab',

      // Hand Lab / FeltLab
      'hl.import': 'Importar',
      'hl.exportJson': 'Exportar JSON',
      'hl.saveNote': 'Guardar nota',
      'hl.saved': 'Guardado',
      'hl.backToHandLab': 'Volver a Hand Lab',
      'hl.prevHand': 'Mano anterior',
      'hl.nextHand': 'Mano siguiente',
      'hl.prevStep': 'Paso anterior',
      'hl.nextStep': 'Paso siguiente',
      'hl.play': 'Reproducir',
      'hl.pause': 'Pausar',
      'hl.reload': 'Recargar',
      'hl.notes': 'Notas',
      'hl.favorites': 'Favoritos',
      'hl.stats': 'Stats',
      'hl.replay': 'Replay',
      'hl.hands': 'Manos',
      'hl.library': 'Biblioteca',
      'hl.importSession': 'Importar sesión (.json)',
      'hl.importSelected': 'Importar seleccionados',

      // Range Lab
      'rl.importLoad': 'Importar / Cargar',
      'rl.importLoadDesc': 'Manos y tablas preflop',
      'rl.replaceHands': 'Reemplazar manos',
      'rl.replaceHandsDesc': 'Mantiene las tablas',
      'rl.heatmaps': 'Heatmaps',
      'rl.leaks': 'Leaks',
      'rl.gto': 'GTO',
      'rl.noTablePos': 'Falta tabla para esta posición',
      'rl.analysis': 'Análisis',
      'rl.filters': 'Filtros',

      // MTT Exploiter
      'mtt.importLoad': 'Importar / Cargar',
      'mtt.importLoadDesc': 'Manos + tablas preflop',
      'mtt.replaceHands': 'Reemplazar manos',
      'mtt.replaceHandsDesc': 'Mantiene las tablas',
      'mtt.pool': 'Pool Exploiter',
      'mtt.villain': 'Villain Profiler',
      'mtt.exploits': 'Exploits',
      'mtt.noData': 'Sin datos cargados',

      // Admin
      'admin.title': 'Dashboard de administración',
      'admin.subtitle': 'Usuarios · códigos · solicitudes de plan · uso · base de datos',
      'admin.users': 'Usuarios',
      'admin.admins': 'Admins',
      'admin.codes': 'Códigos',
      'admin.available': 'Disponibles',
      'admin.requests': 'Solicitudes',
      'admin.opens': 'Aperturas',
      'admin.tabCodes': 'Códigos',
      'admin.tabUsers': 'Usuarios',
      'admin.tabRequests': 'Solicitudes',
      'admin.tabUsage': 'Uso',
      'admin.tabDb': 'BD',
      'admin.createCode': 'Crear código de invitación',
      'admin.codeOptional': 'Código (opcional)',
      'admin.labelPlan': 'Etiqueta / plan',
      'admin.noteInternal': 'Nota interna',
      'admin.quantity': 'Cantidad',
      'admin.tools': 'Herramientas',
      'admin.create': 'Crear',
      'admin.all': 'Todas',
      'admin.onlyFree': 'Solo free',
      'admin.editUser': 'Editar usuario',
      'admin.planLabel': 'Plan / etiqueta',
      'admin.role': 'Rol',
      'admin.roleUser': 'Usuario',
      'admin.roleAdmin': 'Administrador',
      'admin.save': 'Guardar',
      'admin.cancel': 'Cancelar',
      'admin.portal': 'Portal',
      'admin.planRequests': 'Solicitudes de cambio de plan',
      'admin.usageByTool': 'Uso por herramienta',
      'admin.usageByUser': 'Uso por usuario',
      'admin.recentActivity': 'Actividad reciente',
      'admin.database': 'Base de datos',
      'admin.tables': 'Tablas',
    },
    en: {
      'common.theme': 'Light/dark theme',
      'common.language': 'Language',
      'common.lang.es': 'Español',
      'common.lang.en': 'English',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.logout': 'Log out',
      'common.logoutConfirm': 'Log out?',
      'common.backPortal': 'Back to portal',
      'common.loading': 'Loading…',
      'common.error': 'Error',
      'common.success': 'Success',
      'common.admin': 'Admin',
      'common.free': 'Free',
      'common.plan': 'Plan',
      'common.profile': 'My profile',
      'common.open': 'Open',
      'common.edit': 'Edit',
      'common.delete': 'Delete',
      'common.confirm': 'Confirm',
      'common.yes': 'Yes',
      'common.no': 'No',
      'common.optional': 'optional',
      'common.required': 'required',

      'login.title': 'Sign in — RangeLab',
      'login.subtitle': 'Poker tools suite',
      'login.eyebrow': 'Complete poker suite',
      'login.hero': 'Your poker lab.',
      'login.heroEm': 'On your server.',
      'login.desc': 'Equity, preflop, bankroll, replay, range analyzer and MTT exploiter. Private data on your server.',
      'login.authTitle': 'Sign in',
      'login.authSub': 'Access your private lab',
      'login.tabLogin': 'Sign in',
      'login.tabRegister': 'Create account',
      'login.displayName': 'Display name',
      'login.displayNamePh': 'Optional',
      'login.username': 'Username',
      'login.usernamePh': 'min. 3 characters',
      'login.password': 'Password',
      'login.passwordPh': 'min. 8 characters',
      'login.invite': 'Invite code',
      'login.invitePh': 'e.g. PERTO',
      'login.inviteHint': 'No code = free plan (Equity + MTT Exploiter). A code unlocks that plan’s tools.',
      'login.submit': 'Sign in',
      'login.submitRegister': 'Create account',
      'login.registerTitle': 'Create account',
      'login.registerSub': 'Register on this server',
      'login.hintExists': 'If the user already exists, use Sign in. Do not create the same account again.',
      'login.wantFull': 'Want full access?',
      'login.requestCode': 'Request your code by email',
      'login.feat1': 'Secure access with your account',
      'login.feat2': 'Desktop and mobile ready',
      'login.feat3': '8 tools · single sign-in',
      'login.feat4': 'Invite codes by plan',
      'login.remember': 'Remember session on this device',
      'login.rememberHint': 'If you log out you can sign in with another account. Unchecked, the session ends when you close the browser.',
      'login.footer': 'Built by RangeSoft® · © 2026',

      'portal.title': 'RangeLab — Poker Tools',
      'portal.heroEyebrow': 'Complete poker suite',
      'portal.heroTitle': '8 tools.',
      'portal.heroGrad': 'One lab.',
      'portal.heroDesc': 'Equity, Preflop, Bankroll, Hand Lab, Range Lab, MTT Exploiter and AI Table. Everything in one place, ready to play.',
      'portal.statTools': 'tools',
      'portal.statPrivate': 'Private data',
      'portal.statMulti': 'Multi-device',
      'portal.pinTip': 'Tip:',
      'portal.pinTipText': 'Tap the pin on a card to pin it: it appears above as a circle and opens on tap.',
      'portal.allTools': 'All tools',
      'portal.locked': 'Locked',
      'portal.lockedHint': 'Requires a plan or invite code',
      'portal.openTool': 'Open',
      'portal.pin': 'Pin to top',
      'portal.unpin': 'Unpin',
      'portal.changePwd': 'Change password',
      'portal.upgrade': 'Change / upgrade plan',
      'portal.logout': 'Log out',
      'portal.adminDash': 'Admin Dashboard',

      'profile.title': 'My profile',
      'profile.subtitle': 'Account, membership and data',
      'profile.sectionAccount': 'Account',
      'profile.sectionMembership': 'Membership',
      'profile.sectionData': 'Saved data',
      'profile.sectionSecurity': 'Security',
      'profile.sectionLang': 'Language',
      'profile.username': 'Username',
      'profile.displayName': 'Display name',
      'profile.role': 'Role',
      'profile.plan': 'Current plan',
      'profile.inviteUsed': 'Invite used',
      'profile.created': 'Account created',
      'profile.lastLogin': 'Last login',
      'profile.noInvite': 'None',
      'profile.roleAdmin': 'Administrator',
      'profile.roleUser': 'User',
      'profile.changeUsername': 'Change username',
      'profile.changeDisplay': 'Change display name',
      'profile.changePassword': 'Change password',
      'profile.oldPassword': 'Current password',
      'profile.newPassword': 'New password',
      'profile.confirmPassword': 'Confirm new',
      'profile.saveProfile': 'Save changes',
      'profile.pwdSaved': 'Password changed successfully',
      'profile.profileSaved': 'Profile updated',
      'profile.pwdMismatch': 'New passwords do not match',
      'profile.fillAll': 'Fill in all fields',
      'profile.pwdMin': 'New password must be at least 4 characters',
      'profile.dataEquity': 'Equity sessions',
      'profile.dataPreflop': 'Preflop tables',
      'profile.dataTournaments': 'Tournaments',
      'profile.dataTransactions': 'Transactions',
      'profile.dataHands': 'Hands (Hand Lab)',
      'profile.dataNotes': 'Hand notes',
      'profile.dataFavorites': 'Favorites',
      'profile.toolsAccess': 'Available tools',
      'profile.langHint': 'Language applies immediately across the suite.',
      'profile.openProfile': 'View profile',
      'profile.sectionEdit': 'Edit account',

      'tool.equity': 'Equity Lab',
      'tool.preflop': 'Preflop Lab',
      'tool.tracker': 'Bankroll Lab',
      'tool.feltlab': 'Hand Lab',
      'tool.range-analyzer': 'Range Lab',
      'tool.mtt-exploiter': 'MTT Exploiter',
      'tool.ailab': 'AI Table',
      'tool.equity.desc': 'Multi-player equity · Monte Carlo',
      'tool.preflop.desc': '6-max / 8-max tables · Trainer',
      'tool.tracker.desc': 'Bankroll · Tournaments · ROI',
      'tool.feltlab.desc': 'Replay · Stats · Notes',
      'tool.range-analyzer.desc': 'Heatmaps · Leaks · GTO 8-max',
      'tool.mtt-exploiter.desc': 'Pool · Villain Profiler · Exploits',
      'tool.ailab.desc': 'Table vs AI · Hand Lab',

      // ── Common tool chrome ──
      'nav.menu': 'Menu',
      'nav.closeMenu': 'Close menu',
      'nav.backPortal': 'Back to portal',
      'nav.backPortalDesc': 'RangeLab Suite',
      'nav.navigation': 'Navigation',
      'nav.data': 'Data',
      'nav.session': 'Current session',
      'nav.serverStatus': 'Server status',
      'nav.logout': 'Log out',
      'nav.logoutDesc': 'Sign out of your account',
      'nav.help': 'Help',
      'nav.helpDesc': 'How it works',
      'nav.credits': 'Credits',
      'nav.creditsDesc': 'Project authors',
      'nav.settings': 'Settings',
      'common.exportJson': 'Export JSON',
      'common.exportJsonDesc': 'Download file',
      'common.importJson': 'Import JSON',
      'common.importJsonDesc': 'Load from file',
      'common.import': 'Import',
      'common.export': 'Export',
      'common.save': 'Save',
      'common.close': 'Close',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.new': 'New',
      'common.start': 'Start',
      'common.stop': 'Stop',
      'common.connected': 'Connected',
      'common.offline': 'Offline',
      'common.noData': 'No data loaded',
      'common.confirmLogout': 'Log out?',

      // Equity Lab
      'eq.newSession': 'New session',
      'eq.newSessionDesc': 'Start from scratch',
      'eq.saveSession': 'Save session',
      'eq.saveSessionDesc': 'Save to server',
      'eq.mySessions': 'My sessions',
      'eq.mySessionsDesc': 'Load / manage saved',
      'eq.potOdds': 'Pot Odds',
      'eq.potOddsDesc': 'Quick reference table',
      'eq.saveJpg': 'Save as JPG',
      'eq.start': 'Start',
      'eq.stop': 'Stop',
      'eq.players': 'Players',
      'eq.board': 'Board',
      'eq.equity': 'Equity',
      'eq.wins': 'Wins',
      'eq.ties': 'Ties',
      'eq.range': 'Range',
      'eq.hand': 'Hand',
      'eq.simulations': 'Simulations',
      'eq.iterations': 'Iterations',
      'eq.clearBoard': 'Clear board',
      'eq.randomBoard': 'Random board',
      'eq.addPlayer': 'Add player',
      'eq.removePlayer': 'Remove player',

      // Preflop Lab
      'pf.navigation': 'Navigation',
      'pf.strategy': 'Strategy',
      'pf.saveTable': 'Save current table',
      'pf.saveTableDesc': 'Sync with server',
      'pf.newStrategy': 'New strategy',
      'pf.newStrategyDesc': 'Start from scratch',
      'pf.exportDesc': 'Download full strategy',
      'pf.importDesc': 'Load strategy from file',
      'pf.trainer': 'Trainer',
      'pf.selectMode': 'Select',
      'pf.paintMode': 'Paint',
      'pf.undo': 'Undo',
      'pf.copyRange': 'Copy range',
      'pf.pasteRange': 'Paste range',
      'pf.clearTable': 'Clear table',
      'pf.apply100': 'Apply 100% to selection',
      'pf.positions': 'Positions',
      'pf.actions': 'Actions',
      'pf.tables': 'Tables',

      // Bankroll Lab / Tracker
      'tr.deposit': 'Deposit',
      'tr.depositDesc': 'Add funds to bankroll',
      'tr.withdraw': 'Withdraw',
      'tr.withdrawDesc': 'Take funds from bankroll',
      'tr.history': 'History',
      'tr.home': 'Home',
      'tr.registerTournament': 'Register Tournament',
      'tr.bankrollEvolution': 'Bankroll Evolution',
      'tr.tournaments': 'Tournaments',
      'tr.roi': 'ROI',
      'tr.profit': 'Profit',
      'tr.buyin': 'Buy-in',
      'tr.prize': 'Prize',
      'tr.position': 'Position',
      'tr.room': 'Room',
      'tr.date': 'Date',
      'tr.balance': 'Balance',
      'tr.stats': 'Stats',
      'tr.filters': 'Filters',
      'tr.all': 'All',
      'tr.weekly': 'Weekly',
      'tr.monthly': 'Monthly',
      'tr.dateRange': 'Date range',
      'tr.subtitle': 'Tournaments · ROI · RangeLab',

      // Hand Lab / FeltLab
      'hl.import': 'Import',
      'hl.exportJson': 'Export JSON',
      'hl.saveNote': 'Save note',
      'hl.saved': 'Saved',
      'hl.backToHandLab': 'Back to Hand Lab',
      'hl.prevHand': 'Previous hand',
      'hl.nextHand': 'Next hand',
      'hl.prevStep': 'Previous step',
      'hl.nextStep': 'Next step',
      'hl.play': 'Play',
      'hl.pause': 'Pause',
      'hl.reload': 'Reload',
      'hl.notes': 'Notes',
      'hl.favorites': 'Favorites',
      'hl.stats': 'Stats',
      'hl.replay': 'Replay',
      'hl.hands': 'Hands',
      'hl.library': 'Library',
      'hl.importSession': 'Import session (.json)',
      'hl.importSelected': 'Import selected',

      // Range Lab
      'rl.importLoad': 'Import / Load',
      'rl.importLoadDesc': 'Hands and preflop tables',
      'rl.replaceHands': 'Replace hands',
      'rl.replaceHandsDesc': 'Keeps tables',
      'rl.heatmaps': 'Heatmaps',
      'rl.leaks': 'Leaks',
      'rl.gto': 'GTO',
      'rl.noTablePos': 'Missing table for this position',
      'rl.analysis': 'Analysis',
      'rl.filters': 'Filters',

      // MTT Exploiter
      'mtt.importLoad': 'Import / Load',
      'mtt.importLoadDesc': 'Hands + preflop tables',
      'mtt.replaceHands': 'Replace hands',
      'mtt.replaceHandsDesc': 'Keeps tables',
      'mtt.pool': 'Pool Exploiter',
      'mtt.villain': 'Villain Profiler',
      'mtt.exploits': 'Exploits',
      'mtt.noData': 'No data loaded',

      // Admin
      'admin.title': 'Admin dashboard',
      'admin.subtitle': 'Users · codes · plan requests · usage · database',
      'admin.users': 'Users',
      'admin.admins': 'Admins',
      'admin.codes': 'Codes',
      'admin.available': 'Available',
      'admin.requests': 'Requests',
      'admin.opens': 'Opens',
      'admin.tabCodes': 'Codes',
      'admin.tabUsers': 'Users',
      'admin.tabRequests': 'Requests',
      'admin.tabUsage': 'Usage',
      'admin.tabDb': 'DB',
      'admin.createCode': 'Create invite code',
      'admin.codeOptional': 'Code (optional)',
      'admin.labelPlan': 'Label / plan',
      'admin.noteInternal': 'Internal note',
      'admin.quantity': 'Quantity',
      'admin.tools': 'Tools',
      'admin.create': 'Create',
      'admin.all': 'All',
      'admin.onlyFree': 'Free only',
      'admin.editUser': 'Edit user',
      'admin.planLabel': 'Plan / label',
      'admin.role': 'Role',
      'admin.roleUser': 'User',
      'admin.roleAdmin': 'Administrator',
      'admin.save': 'Save',
      'admin.cancel': 'Cancel',
      'admin.portal': 'Portal',
      'admin.planRequests': 'Plan change requests',
      'admin.usageByTool': 'Usage by tool',
      'admin.usageByUser': 'Usage by user',
      'admin.recentActivity': 'Recent activity',
      'admin.database': 'Database',
      'admin.tables': 'Tables',
    }
  };

  function detect() {
    try {
      var stored = localStorage.getItem(KEY);
      if (stored && SUPPORTED.indexOf(stored) >= 0) return stored;
    } catch (e) {}
    return 'en';
  }

  var currentLang = detect();

  function t(key, fallback) {
    var d = DICT[currentLang] || DICT.es;
    if (d[key] != null) return d[key];
    if (DICT.es[key] != null) return DICT.es[key];
    return fallback != null ? fallback : key;
  }

  function setLang(lang, persist) {
    if (SUPPORTED.indexOf(lang) < 0) return;
    currentLang = lang;
    document.documentElement.setAttribute('lang', lang);
    if (persist !== false) {
      try { localStorage.setItem(KEY, lang); } catch (e) {}
    }
    applyDom();
    try {
      global.dispatchEvent(new CustomEvent('rangelab:langchange', { detail: { lang: lang } }));
    } catch (e) {}
  }

  function applyDom(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (!key) return;
      var val = t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        // only if placeholder not set separately
      } else {
        el.textContent = val;
      }
    });
    root.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      if (key) el.innerHTML = t(key);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria');
      if (key) el.setAttribute('aria-label', t(key));
    });
    // Update lang toggle buttons
    root.querySelectorAll('[data-lang-set]').forEach(function (btn) {
      var L = btn.getAttribute('data-lang-set');
      btn.classList.toggle('active', L === currentLang);
      btn.setAttribute('aria-pressed', L === currentLang ? 'true' : 'false');
    });
  }

  function wireLangButtons(root) {
    root = root || document;
    root.querySelectorAll('[data-lang-set]').forEach(function (btn) {
      if (btn.dataset.rlLangWired) return;
      btn.dataset.rlLangWired = '1';
      btn.addEventListener('click', function () {
        var L = btn.getAttribute('data-lang-set');
        setLang(L, true);
        // Persist to server if logged in
        try {
          fetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ preferred_lang: L })
          }).catch(function () {});
        } catch (e) {}
      });
    });
  }

  function init() {
    document.documentElement.setAttribute('lang', currentLang);
    applyDom();
    wireLangButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Sync from server preferred_lang when available
  global.addEventListener('rangelab:user', function (ev) {
    try {
      var u = ev.detail && ev.detail.user;
      if (u && u.preferred_lang && SUPPORTED.indexOf(u.preferred_lang) >= 0) {
        // Server preference wins only if user hasn't explicitly set localStorage this session
        var stored = null;
        try { stored = localStorage.getItem(KEY); } catch (e) {}
        if (!stored) setLang(u.preferred_lang, true);
      }
    } catch (e) {}
  });

  global.RangeLabI18n = {
    t: t,
    setLang: setLang,
    getLang: function () { return currentLang; },
    applyDom: applyDom,
    wireLangButtons: wireLangButtons,
    SUPPORTED: SUPPORTED
  };
})(typeof window !== 'undefined' ? window : this);

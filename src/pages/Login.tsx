import { useState, type FormEvent } from 'react';
import { ArrowRight, Mail01 } from '@untitledui/icons';
import { toast } from 'sonner';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import offitecLogo from '../assets/images/offitec.png';
import { apiClient } from '../lib/axios';
import { useAuthStore } from '../store/authStore';

const DemoNotice = () => (
    <p className="mt-6 text-center text-xs leading-5 text-tertiary">
        Bu Offitec ERP web uygulamasının demo sürümüdür. İzinsiz çoğaltılması veya kullanılması yasaktır.
    </p>
);

const ArtworkPanel = () => (
    <aside className="hidden min-h-screen items-stretch justify-end bg-white lg:flex">
        <div className="relative min-h-screen w-full overflow-hidden rounded-l-[48px] rounded-r-none bg-[#eef2f8]">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 720 920" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
                <defs>
                    <linearGradient id="offitecPanelBg" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#f8fafc" />
                        <stop offset="52%" stopColor="#e9eef7" />
                        <stop offset="100%" stopColor="#d5deec" />
                    </linearGradient>
                    <g id="offitecSnowMark">
                        <circle r="58" fill="#1a2361" />
                        <g stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M0 -43V43" strokeWidth="10" />
                            <path d="M-37 -21L37 21" strokeWidth="10" />
                            <path d="M37 -21L-37 21" strokeWidth="10" />
                            <path d="M0 -29L-13 -43M0 -29L13 -43" strokeWidth="8" />
                            <path d="M0 29L-13 43M0 29L13 43" strokeWidth="8" />
                            <path d="M-25 -14L-43 -10M-25 -14L-30 -33" strokeWidth="8" />
                            <path d="M25 14L43 10M25 14L30 33" strokeWidth="8" />
                            <path d="M25 -14L43 -10M25 -14L30 -33" strokeWidth="8" />
                            <path d="M-25 14L-43 10M-25 14L-30 33" strokeWidth="8" />
                        </g>
                    </g>
                </defs>

                <rect width="720" height="920" fill="url(#offitecPanelBg)" />
                <circle cx="620" cy="118" r="230" fill="#8b8ea7" opacity="0.13" />
                <circle cx="118" cy="760" r="260" fill="#1a2361" opacity="0.08" />
                <rect x="430" y="72" width="420" height="92" rx="46" fill="#ffffff" opacity="0.42" transform="rotate(35 430 72)" />
                <rect x="-54" y="520" width="360" height="86" rx="43" fill="#ffffff" opacity="0.35" transform="rotate(-28 -54 520)" />

                <path d="M72 152H306" stroke="#1a2361" strokeWidth="10" strokeLinecap="round" opacity="0.78" />
                <path d="M72 184H228" stroke="#8b8ea7" strokeWidth="8" strokeLinecap="round" opacity="0.58" />

                <g opacity="0.2">
                    <path d="M452 618H548M500 570V666" stroke="#1a2361" strokeWidth="22" strokeLinecap="round" />
                    <rect x="470" y="590" width="60" height="60" fill="#e31b23" opacity="0.78" />
                    <path d="M500 604V636M484 620H516" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" />
                </g>

                <use href="#offitecSnowMark" transform="translate(540 330) scale(1.82)" opacity="0.7" />
                <use href="#offitecSnowMark" transform="translate(188 704) scale(0.86)" opacity="0.13" />
                <path d="M504 734C582 720 650 696 724 652" fill="none" stroke="#e31b23" strokeWidth="18" strokeLinecap="round" />
                <path d="M540 792C610 780 668 762 724 728" fill="none" stroke="#e31b23" strokeWidth="7" strokeLinecap="round" opacity="0.72" />
            </svg>
        </div>
    </aside>
);

export const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const { login, fetchProfile } = useAuthStore();

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!email || !password) {
            toast.error('Please enter your email and password.');
            return;
        }

        try {
            setLoading(true);
            const response = await apiClient.post('/auth/login', { email, password });
            const { token, employee } = response.data;

            if (!token || !employee) {
                throw new Error(response.data?.error || response.data?.message || 'Sign in response is missing required data.');
            }

            login(token, employee);
            await fetchProfile();
            toast.success('Signed in successfully.');
        } catch (error: any) {
            toast.error(error.response?.data?.error || error.response?.data?.message || error.message || 'Invalid sign in details.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="grid min-h-screen bg-white text-primary lg:grid-cols-[minmax(0,1fr)_minmax(540px,50vw)]">
            <section className="flex min-h-screen flex-col px-6 py-6 sm:px-10 lg:px-12 xl:px-16">
                <header className="flex items-center">
                    <img src={offitecLogo} alt="Offitec ERP" className="h-10 w-auto object-contain" />
                </header>

                <div className="flex flex-1 items-center justify-center py-12">
                    <div className="w-full max-w-[360px]">
                        <div className="mb-8">
                            <h1 className="text-display-xs font-semibold tracking-tight text-primary">Sign in</h1>
                            <p className="mt-2 text-sm text-tertiary">Welcome back to your workspace.</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <Input
                                label="Email"
                                type="email"
                                value={email}
                                onChange={setEmail}
                                placeholder="name@offitec.ch"
                                size="lg"
                                icon={Mail01}
                                isRequired
                            />

                            <Input
                                label="Password"
                                type="password"
                                value={password}
                                onChange={setPassword}
                                placeholder="Enter your password"
                                size="lg"
                                isRequired
                            />

                            <Button
                                type="submit"
                                size="lg"
                                color="primary"
                                className="w-full bg-[#1a2361] shadow-[0_8px_18px_rgba(26,35,97,0.18)] hover:bg-[#272f67]"
                                iconTrailing={ArrowRight}
                                isLoading={loading}
                                showTextWhileLoading
                            >
                                Sign in
                            </Button>
                        </form>

                        <DemoNotice />
                    </div>
                </div>

                <footer className="flex flex-col gap-2 text-xs text-quaternary sm:flex-row sm:items-center sm:justify-between">
                    <span>Offitec ERP {new Date().getFullYear()}</span>
                    <span>help@offitec.ch</span>
                </footer>
            </section>

            <ArtworkPanel />
        </main>
    );
};

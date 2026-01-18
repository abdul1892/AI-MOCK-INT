import {
    Chart as ChartJS,
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

ChartJS.register(
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend
);

const ReportComponent = ({ data }) => {
    if (!data) return <div>Loading report...</div>

    const chartData = {
        labels: ['Technical', 'Communication', 'Problem Solving', 'Confidence', 'Depth'],
        datasets: [
            {
                label: 'Candidate Score',
                data: [
                    data.technical_score,
                    data.communication_score,
                    data.problem_solving_score,
                    // Add dummy values for better radar shape if only 3 real scores
                    (data.communication_score + data.technical_score) / 2,
                    (data.problem_solving_score + data.technical_score) / 2
                ],
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 2,
            },
        ],
    };

    return (
        <div className="report-container" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{ textAlign: 'center' }}>Interview Performance Report</h2>

            <div style={{ height: '300px', display: 'flex', justifyContent: 'center' }}>
                <Radar
                    data={chartData}
                    options={{
                        scales: {
                            r: {
                                min: 0,
                                max: 10,
                                ticks: {
                                    display: false // Hide the numbers
                                },
                                pointLabels: {
                                    font: { size: 12 } // Smaller font for labels (Technical, etc)
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false // Hide legend if redundant
                            }
                        }
                    }}
                />
            </div>

            <div className="feedback-section" style={{ marginTop: '30px' }}>
                <h3>Overall Feedback</h3>
                <p>{data.feedback}</p>

                <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ color: 'green' }}>Strengths</h4>
                        <ul>
                            {data.strengths.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                    </div>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ color: 'red' }}>Areas for Improvement</h4>
                        <ul>
                            {data.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                    </div>
                </div>
            </div>

            <button
                onClick={() => window.location.reload()}
                style={{ marginTop: '30px', padding: '10px 20px', backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
            >
                Start New Interview
            </button>
        </div>
    )
}

export default ReportComponent

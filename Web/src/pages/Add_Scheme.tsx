import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ordersService } from "../services/ordersService";
import { userService } from "../services/userService";
import "../styles/Add_Scheme.css";

type StateOption = {
  id: number;
  name: string;
  code: string;
};

export default function Add_Scheme() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [states, setStates] = useState<StateOption[]>([]);
  const [isLoadingStates, setIsLoadingStates] = useState(false);
  const [formData, setFormData] = useState({
    scheme_name: "",
    item_code: "",
    state_code: "",
  });

  const payload = {
    scheme_name: formData.scheme_name,
    item_code: formData.item_code,
    state_code: formData.state_code,
  };

  useEffect(() => {
    const fetchStates = async () => {
      setIsLoadingStates(true);
      try {
        const data = await userService.getState();
        setStates(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error fetching states:", error);
        setStates([]);
      } finally {
        setIsLoadingStates(false);
      }
    };

    void fetchStates();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await ordersService.createScheme(payload);

      console.log("Success:", response);

      alert("Scheme created successfully");

      setFormData({
        scheme_name: "",
        item_code: "",
        state_code: "",
      });
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to create scheme");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="asg-page app-page">
      {/* <div className="asg-header app-page-head">
        <div>
          <span className="app-chip asg-chip">Scheme Setup</span>
          <h1 className="asg-title app-page-title">Add Scheme</h1>
          <p className="asg-subtitle app-page-subtitle">
            Create product schemes.
          </p>
        </div>
      </div> */}

      <div className="asg-form-card app-card">
        <div className="asg-form-head">
          <h1 className="asg-form-title">Add Scheme</h1>
          {/* <p className="asg-form-subtitle">
            Fill in the scheme name, product item code and state.
          </p> */}
        </div>

        <form className="asg-form" onSubmit={handleSubmit}>
          <div className="asg-form-grid">
            <div className="asg-field">
              <label className="asg-label" htmlFor="scheme_name">
                Scheme Name
              </label>
              <div className="asg-input-wrap">
                <input
                  id="scheme_name"
                  name="scheme_name"
                  type="text"
                  placeholder="Enter scheme name"
                  value={formData.scheme_name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="asg-field">
              <label className="asg-label" htmlFor="state_code">
                State
              </label>
              <div className="asg-input-wrap">
                <select
                  id="state_code"
                  name="state_code"
                  value={formData.state_code}
                  onChange={handleChange}
                  required
                  disabled={isLoadingStates}
                >
                  <option value="">
                    {isLoadingStates ? "Loading states..." : "Select state"}
                  </option>
                  {states.map((state) => (
                    <option key={state.id} value={state.code}>
                      {state.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="asg-field">
              <label className="asg-label" htmlFor="item_code">
                Item Code
              </label>
              <div className="asg-input-wrap">
                <input
                  id="item_code"
                  name="item_code"
                  type="text"
                  placeholder="Eg: FG0000005"
                  value={formData.item_code}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

          </div>

          <div className="asg-actions">
            <button
              className="asg-submit"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
